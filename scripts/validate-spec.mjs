#!/usr/bin/env node
// trellis — spec validator.
//
// Checks a spec against templates/SPEC.md. Everything here is structure a machine can see, which is
// the point: `rules/README.md` puts a rule at the earliest tier that can express it, and a rule about
// whether a field is filled in belongs at tier 3, not in a document somebody has to remember.
//
//   node validate-spec.mjs <file>
//   node validate-spec.mjs <dir> --all
//
// Exit 0 = no errors (warnings may exist). Exit 1 = at least one error.
//
// The rule that motivated this file: **an approved spec with `owner: ~` is a set of questions with no
// address.** Three specs written from real material by an earlier session all came out that way, and
// each one raised its own missing owner as an assumption — the analysis knew, and had nowhere to send
// it. A draft is allowed not to know yet. An approved spec is not.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { parseFrontmatter, section } from './lib/frontmatter.mjs'

const STATUS = ['draft', 'approved', 'superseded']
// `owner` is deliberately NOT here. A draft is allowed not to know who answers yet — that is what a
// draft is for. It becomes an error the moment the spec is approved, checked separately below.
const REQUIRED = ['id', 'title', 'status', 'date']
const SECTIONS = ['## Why', '## Outcome', '## Decisions', '## Out of scope', '## Open questions']

// Each of these must carry an answer AND a reason. `none` is an answer; blank is a gap.
// rules/core.md §12 — cross-cutting concerns are decided on the spec, never per contract.
const CROSS_CUTTING = [
  ['feature_flag', 'flag_reason'],
  ['e2e', 'e2e_reason']
]

const unanswered = v => v === undefined || v === null || String(v).trim() === '' || /^<.*>$/.test(String(v))

function validate (file, text) {
  const errors = []; const warnings = []
  const fm = parseFrontmatter(text)
  if (fm.error) return { errors: [fm.error], warnings }
  const { data, body } = fm

  for (const key of REQUIRED) {
    if (unanswered(data[key])) errors.push(`missing required field: ${key}`)
  }
  if (data.status && !STATUS.includes(data.status)) {
    errors.push(`status must be one of ${STATUS.join(' | ')}, got "${data.status}"`)
  }

  // The rule this file exists for.
  if (data.status === 'draft' && unanswered(data.owner)) {
    warnings.push(
      'owner is unset — allowed while this is a draft, and it blocks approval. Name the person or ' +
      'role who answers the open questions before anyone acts on them'
    )
  }
  if (data.status && data.status !== 'draft' && unanswered(data.owner)) {
    errors.push(
      `status is "${data.status}" but owner is unset — an approved spec with no owner is a set of ` +
      'questions with no address. A role is a valid answer where no individual has been named'
    )
  }

  for (const [field, reason] of CROSS_CUTTING) {
    if (unanswered(data[field])) errors.push(`${field} is unanswered — write \`none\` with a reason, or the answer (core.md §12)`)
    else if (unanswered(data[reason])) errors.push(`${field} is "${data[field]}" but ${reason} is empty — a declared \`none\` is a decision only when it carries its reason`)
  }
  if (unanswered(data.ceilings)) warnings.push('ceilings is unanswered — state `none` and say you could not tell, so a real limit can be corrected')

  for (const s of SECTIONS) {
    if (!new RegExp(`^${s}\\s*$`, 'm').test(body)) errors.push(`missing required section: ${s}`)
  }

  // ── open questions: shape, not content ────────────────────────────────────
  const oq = section(body, '## Open questions')
  if (oq) {
    const audiences = [...oq.matchAll(/^###\s+(.+?)\s*$/gm)].map(m => m[1])
    const questions = [...oq.matchAll(/^\*\*(.+?)\s*·\s*(.+?)\*\*\s*$/gm)]

    if (questions.length && !audiences.length) {
      warnings.push('open questions are not grouped by who answers — a reader cannot find their own')
    }
    for (const a of audiences) {
      if (/^<.*>$/.test(a)) warnings.push(`audience heading "${a}" is still the template placeholder`)
    }
    // The column that makes silence expensive. Without it a question is merely open.
    const defaults = (oq.match(/\*\*If nobody answers:\*\*/g) || []).length
    if (questions.length && defaults < questions.length) {
      warnings.push(
        `${questions.length - defaults} of ${questions.length} open questions do not say what ships ` +
        'if nobody answers — an unanswered question with no stated default is merely open, not expensive'
      )
    }
  }

  const outOfScope = section(body, '## Out of scope')
  if (outOfScope !== null && !outOfScope.replace(/^>.*$/gm, '').trim()) {
    warnings.push('Out of scope is empty — write `none` if that is the decision; an empty section is a gap')
  }

  return { errors, warnings, data }
}

// ── cli ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const target = args.find(a => !a.startsWith('--'))
if (!target) { console.error('usage: validate-spec.mjs <file|dir> [--all]'); process.exit(2) }

const files = []
;(function collect (p) {
  const st = statSync(p)
  if (st.isDirectory()) {
    // The archive is history. A spec archived under an old shape is not a defect to report today.
    if (basename(p) === 'archive') return
    for (const e of readdirSync(p)) collect(join(p, e))
    return
  }
  if (p.endsWith('.md') && !basename(p).startsWith('_')) files.push(p)
})(target)

let failed = false
for (const f of files) {
  const { errors, warnings } = validate(f, readFileSync(f, 'utf8'))
  const label = relative(process.cwd(), f) || f
  if (errors.length) { failed = true; console.log(`✗ ${label}`) } else console.log(`✓ ${label}`)
  for (const e of errors) console.log(`    ERROR  ${e}`)
  for (const w of warnings) console.log(`    warn   ${w}`)
}
if (!files.length) console.log('no specs found')

process.exit(failed ? 1 : 0)
