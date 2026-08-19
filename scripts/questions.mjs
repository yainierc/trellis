#!/usr/bin/env node
// trellis — pull one audience's open questions out of a spec.
//
// A spec lives in a repository. The person who has to answer half its questions does not, and will
// not clone one to find out what is being asked of them. This prints their section on its own, in a
// shape that can be pasted into a mail or a chat.
//
//   node questions.mjs <spec.md> --list              which audiences the spec addresses
//   node questions.mjs <spec.md> --for "APN Leadership"
//   node questions.mjs <spec.md>                     everyone, grouped
//
// It prints. It never sends, never edits, and never writes into a spec — an answer is carried back
// by a human, deliberately, because a spec that changed itself under a running contract is exactly
// what rules/core.md §2 exists to prevent.
//
// For the same questions as a page a decision-maker can read in their own tool, see
// publish-questions.mjs. Both read the spec through scripts/lib/questions.mjs, so they cannot
// disagree about what was asked.

import { basename } from 'node:path'
import { readSpec, matchAudience } from './lib/questions.mjs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const list = args.includes('--list')
const forIdx = args.indexOf('--for')
const audience = forIdx === -1 ? null : args[forIdx + 1]

if (!file) { console.error('usage: questions.mjs <spec.md> [--list] [--for "<audience>"]'); process.exit(2) }
if (forIdx !== -1 && !audience) { console.error('--for needs an audience'); process.exit(2) }

const spec = readSpec(file)
if (spec.error) { console.error(`${file}: ${spec.error}`); process.exit(2) }

const groups = spec.groups
if (!groups.length) {
  console.error(`${file}: open questions are not grouped by audience — nothing to address`)
  process.exit(1)
}

if (list) {
  console.log(`${basename(file)} — ${spec.data.title || spec.data.id}`)
  console.log(`owner: ${spec.data.owner ?? '~ (unset)'}    status: ${spec.data.status}\n`)
  for (const g of groups) {
    console.log(`  ${String(g.questions.length).padStart(2)}  ${g.audience}`)
  }
  process.exit(0)
}

const wanted = audience ? matchAudience(groups, audience) : groups

if (!wanted.length) {
  console.error(`no audience matching "${audience}". Try --list.`)
  process.exit(1)
}

// The header exists so the reader knows what they are being asked about and by when it matters,
// without needing the repository the spec lives in.
console.log(`# ${spec.data.title || spec.data.id}`)
console.log(`\nThese are the decisions we cannot make for you. Everything else is already underway.`)
console.log(`\nSpec: ${basename(file)} · status ${spec.data.status} · owner ${spec.data.owner ?? 'unassigned'}`)

for (const g of wanted) {
  console.log(`\n---\n\n## ${g.audience}\n`)
  console.log(g.body)
}

console.log(
  `\n---\n\nEach answer becomes a decision on the spec. Where you cannot decide yet, say so and say ` +
  `what would let you — an unanswered question ships its default, and the default is rarely the one ` +
  `anyone would have chosen.`
)
