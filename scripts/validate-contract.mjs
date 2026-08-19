#!/usr/bin/env node
// trellis — contract validator.
//
// Checks a contract file (or a whole tree of them) against rules/core.md §1–§2. Structure that can
// be checked mechanically is checked here rather than trusted to a reviewer: this is tier 3 of the
// enforcement ladder, and it is what the Stop gate calls.
//
//   node validate-contract.mjs <file>
//   node validate-contract.mjs <dir> --all     # adds cross-contract checks (cycles, conflicts)
//
// Exit 0 = no errors (warnings may exist). Exit 1 = at least one error.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { parseFrontmatter, section } from './lib/frontmatter.mjs'
import { contractFiles } from './lib/contract.mjs'
import { norm, overlap } from './lib/paths.mjs'

const STATUS = ['pending', 'active', 'blocked', 'gated', 'completed', 'withdrawn']
const EXECUTOR = ['subagent', 'session']
// Optional: absent means `supervised`. Making it required would invalidate every contract written
// before graduated autonomy existed, and `supervised` is the safe reading of silence.
const AUTONOMY = ['supervised', 'autonomous']
const SCALARS = ['id', 'title', 'spec', 'status', 'executor', 'agent', 'model', 'estimate']
const LISTS = ['depends_on', 'parallel_safe_with', 'reads', 'writes']
const SECTIONS = ['## Objective', '## Constraints', '## Steps', '## Done when', '## Out of scope']

// ── single-contract checks ───────────────────────────────────────────────────
function validate (file, text) {
  const errors = []; const warnings = []
  const fm = parseFrontmatter(text)
  if (fm.error) return { errors: [fm.error], warnings, data: null }
  const { data, body } = fm

  for (const key of SCALARS) {
    if (data[key] === undefined) errors.push(`missing required field: ${key}`)
    else if (Array.isArray(data[key])) errors.push(`${key} must be a scalar, got a list`)
  }
  for (const key of LISTS) {
    if (data[key] === undefined) errors.push(`missing required field: ${key}`)
    else if (!Array.isArray(data[key])) errors.push(`${key} must be a list (use [] for empty)`)
  }
  if (data.gates === undefined) errors.push('missing required field: gates (use `none` when there are none)')

  if (data.status && !STATUS.includes(data.status)) errors.push(`status must be one of ${STATUS.join(' | ')}, got "${data.status}"`)
  if (data.executor && !EXECUTOR.includes(data.executor)) errors.push(`executor must be one of ${EXECUTOR.join(' | ')}, got "${data.executor}"`)
  if (data.autonomy !== undefined && !AUTONOMY.includes(data.autonomy)) errors.push(`autonomy must be one of ${AUTONOMY.join(' | ')}, got "${data.autonomy}"`)

  const writes = Array.isArray(data.writes) ? data.writes : []
  if (!writes.length) errors.push('writes is empty — a contract with nothing to write cannot be scheduled')

  const deps = Array.isArray(data.depends_on) ? data.depends_on : []
  const peers = Array.isArray(data.parallel_safe_with) ? data.parallel_safe_with : []
  if (data.id && deps.includes(data.id)) errors.push('depends_on contains this contract itself')
  for (const p of peers.filter(p => deps.includes(p))) {
    errors.push(`${p} is in both depends_on and parallel_safe_with — a dependency is never parallel-safe`)
  }

  for (const s of SECTIONS) {
    if (!new RegExp(`^${s}\\s*$`, 'm').test(body)) errors.push(`missing required section: ${s}`)
  }

  // ── warnings: shapes that are legal but have burned real projects ──────────
  const doneWhen = section(body, '## Done when')
  if (doneWhen && !/`[^`]+`/.test(doneWhen)) {
    warnings.push('no Done when criterion carries a runnable command — the orchestrator cannot re-execute it')
  }
  const outOfScope = section(body, '## Out of scope')
  if (outOfScope !== null && !outOfScope.replace(/^>.*$/gm, '').trim()) {
    warnings.push('Out of scope is empty — write `none` if that is the decision; an empty section is a gap')
  }
  for (const w of writes) {
    if (!basename(norm(w)).includes('.')) {
      warnings.push(`writes entry "${w}" is a bare directory — it conflicts with every contract touching anything under it. Narrow it, or confirm the directory is the unit of change`)
    }
  }
  const minutes = parseEstimate(data.estimate)
  if (minutes !== null && minutes > 180 && data.executor === 'subagent') {
    warnings.push(`estimate ${data.estimate} exceeds 3h with executor: subagent — over that size use a dedicated session, or split the contract`)
  }
  if (minutes !== null && minutes < 30) {
    warnings.push(`estimate ${data.estimate} is under 30min — usually a sign of over-decomposition; consider bundling into a neighbour`)
  }
  if (data.spec && data.spec !== 'none' && !/^<.*>$/.test(String(data.spec))) {
    // A contract is immutable during execution (§2) and nothing extends that to its parent. Starting
    // against a spec with unanswered questions is allowed — it is the user's call — but never silently.
    try {
      const specFile = join(process.cwd(), String(data.spec).endsWith('.md') ? data.spec : data.spec + '.md')
      if (statSync(specFile).isFile()) {
        const spec = readFileSync(specFile, 'utf8')
        const oq = section(spec.split(/^---\s*$/m).slice(2).join('---'), '## Open questions') || ''
        const n = (oq.match(/^\*\*.+?·.+?\*\*\s*$/gm) || []).length
        if (n) warnings.push(`parent spec has ${n} open question${n === 1 ? '' : 's'} — allowed, but the user should be told before work starts against it`)
      }
    } catch { /* spec not on disk from here; the skill checks it too */ }
  }
  if (data.spec === null) warnings.push('spec is unset — state `none` and declare the work mechanical, or attach the contract to its spec')

  return { errors, warnings, data }
}

function parseEstimate (v) {
  if (!v) return null
  const m = String(v).match(/^(\d+(?:\.\d+)?)\s*(min|m|h|hr|hrs)$/i)
  if (!m) return null
  return /^h/i.test(m[2]) ? Math.round(parseFloat(m[1]) * 60) : Math.round(parseFloat(m[1]))
}

// ── cross-contract checks ────────────────────────────────────────────────────
function crossCheck (contracts) {
  const findings = []
  const byId = new Map(contracts.map(c => [c.data.id, c]))

  for (const c of contracts) {
    for (const d of c.data.depends_on || []) {
      if (!byId.has(d)) findings.push({ level: 'error', id: c.data.id, msg: `depends_on "${d}" does not exist` })
    }
    for (const p of c.data.parallel_safe_with || []) {
      if (!byId.has(p)) { findings.push({ level: 'error', id: c.data.id, msg: `parallel_safe_with "${p}" does not exist` }); continue }
      const shared = overlap(c.data.writes || [], byId.get(p).data.writes || [])
      if (shared.length) {
        findings.push({ level: 'error', id: c.data.id, msg: `claims parallel_safe_with ${p} but their writes overlap on ${shared.join(', ')} — the overlap wins` })
      }
    }
  }

  // cycles in depends_on
  const state = new Map()
  const walk = (id, trail) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'open') {
      findings.push({ level: 'error', id, msg: `dependency cycle: ${[...trail, id].join(' → ')}` })
      return
    }
    state.set(id, 'open')
    for (const d of byId.get(id)?.data.depends_on || []) if (byId.has(d)) walk(d, [...trail, id])
    state.set(id, 'done')
  }
  for (const c of contracts.filter(c => !c.archived)) walk(c.data.id, [])

  // undeclared conflicts between contracts that could run at the same time
  const live = contracts.filter(c => !c.archived && ['pending', 'active'].includes(c.data.status))
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j]
      const shared = overlap(a.data.writes || [], b.data.writes || [])
      if (!shared.length) continue
      const declared = (a.data.parallel_safe_with || []).includes(b.data.id) || (b.data.parallel_safe_with || []).includes(a.data.id)
      const sequenced = (a.data.depends_on || []).includes(b.data.id) || (b.data.depends_on || []).includes(a.data.id)
      if (!declared && !sequenced) {
        findings.push({ level: 'warn', id: `${a.data.id} ∥ ${b.data.id}`, msg: `writes overlap on ${shared.join(', ')} with no dependency edge — they must not run in the same wave` })
      }
    }
  }
  return findings
}

// ── cli ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const target = args.find(a => !a.startsWith('--'))
const all = args.includes('--all')
if (!target) {
  console.error('usage: validate-contract.mjs <file|dir> [--all]')
  process.exit(2)
}

// Archived contracts are still read — a live contract may legitimately depend on one that finished
// months ago, and archiving must never turn that into a dangling reference. What they do NOT do is
// take part in conflict or cycle detection: history cannot collide with live work.
const files = statSync(target).isDirectory()
  ? contractFiles(target)
  : [{ file: target, archived: false }]

let failed = false
const parsed = []
for (const { file: f, archived } of files) {
  const { errors, warnings, data } = validate(f, readFileSync(f, 'utf8'))
  const label = relative(process.cwd(), f) || f
  if (errors.length) {
    failed = true
    console.log(`✗ ${label}`)
    for (const e of errors) console.log(`    ERROR  ${e}`)
  } else {
    console.log(`✓ ${label}${warnings.length ? '' : ''}`)
  }
  for (const w of warnings) console.log(`    warn   ${w}`)
  if (data?.id) parsed.push({ file: f, data, archived })
}

if (all && parsed.length) {
  const nArchived = parsed.filter(c => c.archived).length
  console.log(`\n── cross-contract checks (${parsed.length - nArchived} live` +
    `${nArchived ? `, ${nArchived} archived — referenced but not scheduled` : ''}) ──`)
  const findings = crossCheck(parsed)
  if (!findings.length) console.log('✓ no dependency cycles, dangling references or undeclared write conflicts')
  for (const f of findings) {
    if (f.level === 'error') failed = true
    console.log(`    ${f.level === 'error' ? 'ERROR ' : 'warn  '} ${f.id}: ${f.msg}`)
  }
}

process.exit(failed ? 1 : 0)
