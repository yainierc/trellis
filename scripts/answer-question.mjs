#!/usr/bin/env node
// trellis — land one answer on a spec, and prove that nothing else moved.
//
// Q-02 of docs/specs/questions-reach-the-decider.md, answered on the record:
//
//   *"it is proposed, never written. Claude drafts the amendment and stops; a human lands it. Drafting
//   and amending are separate powers, and collapsing them would let the executor rewrite the rules it
//   operates under."*
//
// This file is that sentence made mechanical.
//
//   node answer-question.mjs <spec.md> --id Q-02 --by "<name>" --answer "<text>"     prints, writes nothing
//   node answer-question.mjs <spec.md> --id Q-02 --by "<name>" --answer "<text>" --apply
//
// **The tool may only insert.** After an `--apply` it removes the block it just added and compares the
// result with the file it started from, byte for byte. If anything else moved — a reworded question, a
// tidied heading, a stray newline — the write is abandoned and nothing is saved. That check is the
// reason a tool is allowed near a requirement at all: `rules/core.md` §2 says a spec does not shift
// under a contract running against it, and this is §2 made checkable rather than promised.
//
// It also refuses three things outright:
//
//   · **an answer with no name.** Six months on, an unattributed answer is worse than an open question,
//     because it looks settled and nobody can be asked what they meant.
//   · **a second answer to an answered question.** That is a supersede, and a human has to decide which
//     one holds — silently appending both leaves the reader to guess.
//   · **an id that does not exist.** Usually a typo, occasionally a question that was removed, and
//     either way inventing a place to put the answer would be worse than stopping.
//
// It never reads comments. It cannot — a script has no access to them, and the skill that can must not
// pretend otherwise.

import { readFileSync, writeFileSync } from 'node:fs'
import { readSpec } from './lib/questions.mjs'

const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args[i + 1] }
const has = name => args.includes(`--${name}`)

const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const id = flag('id')
const by = flag('by')
const answer = flag('answer')
const date = flag('date') || new Date().toISOString().slice(0, 10)

if (!file || !id) {
  console.error('usage: answer-question.mjs <spec.md> --id <Q-01> --by "<name>" --answer "<text>" [--date YYYY-MM-DD] [--apply]')
  process.exit(2)
}
if (!by || !by.trim() || by.startsWith('--')) {
  console.error('--by is required. An answer nobody signed reads as settled and cannot be asked about.')
  process.exit(2)
}
if (!answer || !answer.trim() || answer.startsWith('--')) {
  console.error('--answer is required, and cannot be empty.')
  process.exit(2)
}

const original = readFileSync(file, 'utf8')
const spec = readSpec(file)
if (spec.error) { console.error(`${file}: ${spec.error}`); process.exit(2) }

const questions = spec.groups.flatMap(g => g.questions.map(q => ({ ...q, audience: g.audience })))
const target = questions.find(q => q.id && q.id.toLowerCase() === id.toLowerCase())

if (!target) {
  console.error(`no question with id "${id}" in ${file}.`)
  console.error(`ids present: ${questions.map(q => q.id || '(unnumbered)').join(' · ') || '(none)'}`)
  process.exit(1)
}
if (target.answered) {
  console.error(`${id} already carries an answer:\n`)
  const existing = original.match(new RegExp(`^\\*\\*Answered\\b.*$`, 'm'))
  console.error(`    ${existing ? existing[0].slice(0, 160) : '(present)'}`)
  console.error('\nA second answer is a supersede, and a person has to decide which one holds.')
  process.exit(1)
}

// ── where the block goes ─────────────────────────────────────────────────────
// At the end of this question's own block: after its bullets, before whatever starts next. Anchoring to
// the question's bold line rather than to a line count means a spec that has been edited since still
// lands the answer in the right place.
const headingLine = original.match(new RegExp(`^\\*\\*${target.id}\\s*·.*\\*\\*\\s*$`, 'm'))
if (!headingLine) {
  console.error(`found ${id} when parsing, but not as a literal heading line — refusing to guess where the answer goes.`)
  process.exit(1)
}
const from = original.indexOf(headingLine[0]) + headingLine[0].length
const rest = original.slice(from)
// The next question, the next audience, or the next section — whichever comes first.
const nextIdx = [
  rest.search(/^\*\*[^*\n]+·[^*\n]+\*\*\s*$/m),
  rest.search(/^###\s+/m),
  rest.search(/^##\s+/m)
].filter(i => i !== -1)
const end = nextIdx.length ? from + Math.min(...nextIdx) : original.length

// Insert before the whitespace that separates this block from what follows, and touch nothing else.
// The first version of this normalised the trailing whitespace instead — which lost the blank line
// before the next question, and the insert-only check below refused to save it. That is the check
// earning its place on its first real use.
const trailing = original.slice(from, end).match(/\s*$/)[0]
const at = end - trailing.length
const block = `\n\n**Answered ${date} — ${by.trim()}:** ${answer.trim()}`
const applied = original.slice(0, at) + block + original.slice(at)

console.log(`spec       ${file}`)
console.log(`question   ${target.id} · ${target.title}`)
console.log(`audience   ${target.audience}`)
console.log(`\n${block.trim()}\n`)

if (!has('apply')) {
  console.log('Nothing was written. Re-run with --apply once a person has agreed to this wording.')
  process.exit(0)
}

// ── the insert-only proof ────────────────────────────────────────────────────
// Remove exactly what was added; whatever is left must be the file we started from. This is what makes
// the tool safe to point at a requirement: it cannot reword a question, tidy a heading or drop a line
// without the check noticing and the write being abandoned.
const undone = applied.replace(block, '')
if (undone !== original) {
  console.error('\nABANDONED — the edit would have changed more than the inserted block.')
  const i = [...undone].findIndex((c, n) => c !== original[n])
  console.error(`First divergence at byte ${i}:`)
  console.error(`  original: ${JSON.stringify(original.slice(Math.max(0, i - 40), i + 40))}`)
  console.error(`  would be: ${JSON.stringify(undone.slice(Math.max(0, i - 40), i + 40))}`)
  console.error('\nNothing was written. This is the check that lets a tool near a requirement at all.')
  process.exit(1)
}

writeFileSync(file, applied)
console.log(`applied    ${file}`)
console.log('verified   the inserted block is the only change, byte for byte')
console.log('\nThe answer is on the spec. Now resolve the comment thread it came from — not before, ' +
  'or the person is told their answer is recorded when it is not.')
