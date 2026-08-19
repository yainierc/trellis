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

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseFrontmatter, section } from './lib/frontmatter.mjs'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
const list = args.includes('--list')
const forIdx = args.indexOf('--for')
const audience = forIdx === -1 ? null : args[forIdx + 1]

if (!file) { console.error('usage: questions.mjs <spec.md> [--list] [--for "<audience>"]'); process.exit(2) }
if (forIdx !== -1 && !audience) { console.error('--for needs an audience'); process.exit(2) }

const text = readFileSync(file, 'utf8')
const fm = parseFrontmatter(text)
if (fm.error) { console.error(`${file}: ${fm.error}`); process.exit(2) }

const oq = section(fm.body, '## Open questions')
if (!oq) { console.error(`${file}: no "## Open questions" section`); process.exit(2) }

// Split on audience headings. Anything before the first one is preamble, not a question.
const parts = oq.split(/^###\s+(.+?)\s*$/gm)
const groups = []
for (let i = 1; i < parts.length; i += 2) {
  groups.push({ audience: parts[i].trim(), body: (parts[i + 1] || '').trim() })
}

if (!groups.length) {
  console.error(`${file}: open questions are not grouped by audience — nothing to address`)
  process.exit(1)
}

if (list) {
  console.log(`${basename(file)} — ${fm.data.title || fm.data.id}`)
  console.log(`owner: ${fm.data.owner ?? '~ (unset)'}    status: ${fm.data.status}\n`)
  for (const g of groups) {
    const n = (g.body.match(/^\*\*.+?·.+?\*\*\s*$/gm) || []).length
    console.log(`  ${String(n).padStart(2)}  ${g.audience}`)
  }
  process.exit(0)
}

const wanted = audience
  ? groups.filter(g => g.audience.toLowerCase().includes(audience.toLowerCase()))
  : groups

if (!wanted.length) {
  console.error(`no audience matching "${audience}". Try --list.`)
  process.exit(1)
}

// The header exists so the reader knows what they are being asked about and by when it matters,
// without needing the repository the spec lives in.
console.log(`# ${fm.data.title || fm.data.id}`)
console.log(`\nThese are the decisions we cannot make for you. Everything else is already underway.`)
console.log(`\nSpec: ${basename(file)} · status ${fm.data.status} · owner ${fm.data.owner ?? 'unassigned'}`)

for (const g of wanted) {
  console.log(`\n---\n\n## ${g.audience}\n`)
  console.log(g.body)
}

console.log(
  `\n---\n\nEach answer becomes a decision on the spec. Where you cannot decide yet, say so and say ` +
  `what would let you — an unanswered question ships its default, and the default is rarely the one ` +
  `anyone would have chosen.`
)
