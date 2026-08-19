#!/usr/bin/env node
// trellis — derive `parallel_safe_with` instead of asserting it.
//
// `rules/core.md` §1: *"`parallel_safe_with` is an author's assertion, not a proof. A detected
// `writes` overlap always wins over it."*
//
// The validator has always caught a lying assertion after the fact. Nobody produced the truthful
// one, so every contract carried a hand-written guess about which others it may run beside — and a
// guess in that field either serialises work that could have run together, or lets two contracts
// write the same file at once. This computes it.
//
//   node parallel-matrix.mjs <contracts dir>              print the matrix and any disagreement
//   node parallel-matrix.mjs <contracts dir> --write      write it into each contract's frontmatter
//
// Two contracts are parallel-safe when BOTH hold:
//
//   1. their `writes` sets are disjoint, compared prefix-aware by path segment
//   2. neither is a **transitive** ancestor of the other in `depends_on`
//
// The second is the one that is easy to get wrong. A and B with disjoint writes, where A depends on
// C and C depends on B, are not parallel-safe — and a check that only looks at direct edges says
// they are.

import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { parseFrontmatter } from './lib/frontmatter.mjs'
import { contractFiles } from './lib/contract.mjs'
import { overlap } from './lib/paths.mjs'

const args = process.argv.slice(2)
const dir = args.find(a => !a.startsWith('--'))
const write = args.includes('--write')
if (!dir) { console.error('usage: parallel-matrix.mjs <contracts dir> [--write]'); process.exit(2) }

// Archived contracts are history: they cannot run beside anything, so they take no part.
const contracts = []
for (const { file, archived } of contractFiles(dir)) {
  if (archived) continue
  const fm = parseFrontmatter(readFileSync(file, 'utf8'))
  if (fm.error || !fm.data?.id) continue
  if (!['pending', 'active', 'blocked', 'gated'].includes(fm.data.status)) continue
  contracts.push({
    file,
    id: fm.data.id,
    writes: fm.data.writes || [],
    depends: fm.data.depends_on || [],
    declared: fm.data.parallel_safe_with || []
  })
}

if (!contracts.length) { console.log('no live contracts — nothing to derive'); process.exit(0) }

const byId = new Map(contracts.map(c => [c.id, c]))

// Transitive ancestors through depends_on. Cycles cannot hang this: `seen` closes them.
function ancestors (id, seen = new Set()) {
  for (const d of byId.get(id)?.depends || []) {
    if (byId.has(d) && !seen.has(d)) { seen.add(d); ancestors(d, seen) }
  }
  return seen
}
const related = (a, b) => ancestors(a).has(b) || ancestors(b).has(a)

const derived = new Map()
for (const c of contracts) {
  derived.set(c.id, contracts
    .filter(o => o.id !== c.id)
    .filter(o => !overlap(c.writes, o.writes).length)
    .filter(o => !related(c.id, o.id))
    .map(o => o.id)
    .sort())
}

// ── report ───────────────────────────────────────────────────────────────────
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
let changes = 0
let dangerous = 0

for (const c of contracts) {
  const d = derived.get(c.id)
  const was = [...c.declared].sort()
  const overclaimed = was.filter(x => !d.includes(x))   // asserted safe, provably is not
  const missed = d.filter(x => !was.includes(x))        // provably safe, never claimed

  console.log(`${c.id}`)
  console.log(`  derived  ${d.length ? d.join(', ') : '(none)'}`)
  if (!same(was, d)) {
    changes++
    if (overclaimed.length) {
      dangerous++
      // The dangerous direction: the author said two contracts may run together and they may not.
      console.log(`  ⚠ CLAIMED BUT UNSAFE  ${overclaimed.join(', ')} — overlapping writes or a dependency edge`)
    }
    if (missed.length) console.log(`  + provably safe, unclaimed  ${missed.join(', ')}`)
  }
}

if (write) {
  for (const c of contracts) {
    const d = derived.get(c.id)
    const text = readFileSync(c.file, 'utf8')
    const lines = text.split(/\r?\n/)
    const end = lines.indexOf('---', 1)
    let done = false
    for (let i = 1; i < end; i++) {
      if (/^parallel_safe_with:/.test(lines[i])) {
        // Keep any trailing comment: it usually explains why the author cared.
        const comment = lines[i].match(/\s+#.*$/)?.[0] ?? ''
        lines[i] = `parallel_safe_with: [${d.join(', ')}]${comment}`
        done = true
        break
      }
    }
    if (!done) { console.error(`${relative(process.cwd(), c.file)}: no parallel_safe_with line to replace`); continue }
    writeFileSync(c.file, lines.join('\n'))
  }
  console.log(`\nWritten into ${contracts.length} contract${contracts.length === 1 ? '' : 's'}.`)
} else if (changes) {
  console.log(`\n${changes} contract${changes === 1 ? '' : 's'} disagree with the derivation. Re-run with --write to replace the assertions.`)
} else {
  console.log('\nEvery declaration matches the derivation.')
}

// An overclaim would let two contracts write the same file at once, so it fails the run — unless
// --write just replaced it, in which case the state after the action is clean and saying otherwise
// would make the fix look like a failure.
process.exit(dangerous && !write ? 1 : 0)
