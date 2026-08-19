#!/usr/bin/env node
// trellis — decision record validator.
//
// `rules/core.md` §9 says a decision recorded in an ADR is not relitigated without a new ADR, and says
// nothing about what happens to the old one. That silence is the defect this file exists for.
//
// **Superseding is a two-file operation** and either half alone leaves a lie on disk:
//
//   · a new record naming a predecessor that is still `accepted` — two records both presenting
//     themselves as current, and the reader cites whichever they open first;
//   · a record marked `superseded` that nothing claims to have replaced — a decision withdrawn with no
//     successor, which reads as an oversight because usually it is one.
//
// The second is bad. The first is worse: a stale record that still says `accepted` will be cited, and
// nothing about it looks wrong.
//
//   node validate-adr.mjs <file>
//   node validate-adr.mjs <dir> --all      adds the cross-record supersede checks
//
// Exit 0 = no errors (warnings may exist). Exit 1 = at least one error.
//
// It checks that the reasoning is PRESENT. It never judges whether a decision is sound — that is what
// the human gate and the passage of time are for.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'

const STATUS = ['proposed', 'accepted', 'superseded', 'refused']
const SECTIONS = ['## Context', '## Decision', '## Considered and refused', '## Consequences']

// The header is a bullet list rather than YAML frontmatter, because that is what the records that
// already exist use and a template nobody follows is worse than no template.
function parseHeader (text) {
  const data = {}
  for (const m of text.matchAll(/^-\s+\*\*([A-Za-z]+):\*\*\s*(.*)$/gm)) {
    data[m[1].toLowerCase()] = m[2].trim().replace(/^`|`$/g, '')
  }
  return data
}

const section = (text, heading) => {
  const m = text.match(new RegExp(`^${heading}\\s*$([\\s\\S]*)`, 'm'))
  if (!m) return null
  const next = m[1].search(/^## /m)
  return next === -1 ? m[1] : m[1].slice(0, next)
}

const unset = v => v === undefined || v === '' || /^<.*>$/.test(String(v))
const isNone = v => unset(v) || /^none$/i.test(String(v))

function validate (file, text) {
  const errors = []; const warnings = []
  const data = parseHeader(text)

  if (!/^#\s+ADR\s/m.test(text)) warnings.push('the title does not start with "# ADR NNNN —" — the number is how it is cited')
  if (unset(data.status)) errors.push('missing required field: **Status:**')
  else if (!STATUS.includes(data.status)) errors.push(`status must be one of ${STATUS.join(' | ')}, got "${data.status}"`)
  if (unset(data.date)) errors.push('missing required field: **Date:** — a decision without a date cannot be read against the context that produced it')

  for (const s of SECTIONS) {
    if (!new RegExp(`^${s}\\s*$`, 'm').test(text)) errors.push(`missing required section: ${s}`)
  }

  // §9's whole point. An accepted record with no refusals keeps the outcome and loses the reasoning.
  const refused = section(text, '## Considered and refused')
  if (data.status === 'accepted' && refused !== null && !refused.replace(/^>.*$/gm, '').trim()) {
    errors.push(
      '`## Considered and refused` is empty on an accepted record — §9: that record is the only thing ' +
      'stopping the alternative being re-proposed as a fresh idea'
    )
  }

  const consequences = section(text, '## Consequences')
  if (consequences !== null && !consequences.trim()) {
    warnings.push('`## Consequences` is empty — a decision recorded without its cost reads as free, and none are')
  }
  if (data.status === 'accepted' && !/accepted is not validated/i.test(text)) {
    warnings.push('does not say what evidence this decision still owes — "accepted is not validated" (§9)')
  }

  return { errors, warnings, data, id: (basename(file).match(/^(\d+)/) || [])[1] || null }
}

// ── cli ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const target = args.find(a => !a.startsWith('--'))
const all = args.includes('--all')
if (!target) { console.error('usage: validate-adr.mjs <file|dir> [--all]'); process.exit(2) }

const files = []
;(function collect (p) {
  const st = statSync(p)
  if (st.isDirectory()) {
    if (basename(p) === 'archive' || basename(p).startsWith('_')) return
    for (const e of readdirSync(p)) collect(join(p, e))
    return
  }
  if (p.endsWith('.md') && !basename(p).startsWith('_')) files.push(p)
})(target)

let failed = false
const parsed = []
for (const f of files) {
  const { errors, warnings, data, id } = validate(f, readFileSync(f, 'utf8'))
  const label = relative(process.cwd(), f) || f
  if (errors.length) { failed = true; console.log(`✗ ${label}`) } else console.log(`✓ ${label}`)
  for (const e of errors) console.log(`    ERROR  ${e}`)
  for (const w of warnings) console.log(`    warn   ${w}`)
  parsed.push({ file: f, label, data, id })
}
if (!files.length) console.log('no decision records found')

// ── the two-way supersede check ──────────────────────────────────────────────
if (all && parsed.length) {
  console.log(`\n── supersede integrity (${parsed.length} records) ──`)
  const byId = new Map(parsed.filter(r => r.id).map(r => [String(Number(r.id)), r]))
  const replaced = new Set()
  let problems = 0

  for (const r of parsed) {
    const sup = r.data.supersedes
    if (isNone(sup)) continue
    const num = String(sup).match(/\d+/)
    if (!num) { console.log(`    ERROR  ${r.label}: supersedes "${sup}" names no ADR number`); problems++; continue }
    const key = String(Number(num[0]))
    const older = byId.get(key)
    if (!older) { console.log(`    ERROR  ${r.label}: supersedes ADR ${key}, which does not exist here`); problems++; continue }
    replaced.add(key)
    // The dangerous half: two records both saying `accepted`.
    if (older.data.status !== 'superseded') {
      console.log(
        `    ERROR  ${r.label} supersedes ADR ${key}, but ${basename(older.file)} is still ` +
        `"${older.data.status}" — mark it superseded in the same commit, or a stale record keeps ` +
        'presenting itself as current and will be cited'
      )
      problems++
    }
  }

  for (const r of parsed) {
    if (r.data.status !== 'superseded') continue
    if (!r.id || !replaced.has(String(Number(r.id)))) {
      console.log(
        `    ERROR  ${r.label} is marked superseded, but no record claims to replace it — ` +
        'a decision withdrawn with no successor is usually an oversight'
      )
      problems++
    }
  }

  if (problems) failed = true
  else console.log('✓ every supersede is claimed from both sides')
}

process.exit(failed ? 1 : 0)
