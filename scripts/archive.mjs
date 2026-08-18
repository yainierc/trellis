#!/usr/bin/env node
// trellis — move finished work out of the working set.
//
// `rules/core.md` §10 names the decay signal this closes: *"Memory and rule files only ever grow →
// nothing is being pruned, and the context cost is rising for every session in the repo."* A
// repository two years in has hundreds of completed contracts that the validator walks and a human
// scrolls past, and every one of them is noise around the handful that are live.
//
//   node scripts/archive.mjs --dry-run                 what would move, moves nothing
//   node scripts/archive.mjs                           move completed and withdrawn contracts
//   node scripts/archive.mjs --older-than 30           only those finished more than 30 days ago
//
// Two things it deliberately does not do:
//
//   · It never deletes. Archiving is a move; the file keeps its name, its body and its history.
//   · It never introduces an `archived` status. `status` records how the work ended — location
//     records whether the file has been tidied away. Folding two axes into one enum is what makes
//     "completed" stop meaning anything.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join, dirname, relative, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseFrontmatter } from './lib/frontmatter.mjs'
import { contractFiles } from './lib/contract.mjs'
import { loadProfile } from './lib/profile.mjs'

const FINISHED = ['completed', 'withdrawn']

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const olderThan = (() => {
  const i = args.indexOf('--older-than')
  if (i === -1) return null
  const n = Number(args[i + 1])
  if (!Number.isFinite(n) || n < 0) { console.error('--older-than takes a number of days'); process.exit(2) }
  return n
})()

let loaded
try { loaded = loadProfile(process.cwd()) } catch (err) { console.error(err.message); process.exit(2) }
if (!loaded) { console.error('no .trellis/profile.yml found — this repository has not adopted trellis'); process.exit(2) }

const { root, profile } = loaded
const contractsDir = join(root, profile.paths.contracts)
const archiveDir = join(root, profile.paths.archive || join(profile.paths.contracts, 'archive'))
const specsDir = join(root, profile.paths.specs)
// A spec archives alongside its own kind, not inside the contracts archive. Mixing them makes the
// contracts archive a junk drawer and breaks any tooling that walks it expecting contracts.
const specArchiveDir = join(specsDir, 'archive')

// Last commit date for a file, so "finished 30 days ago" means something real rather than whenever
// the file was last touched by a checkout. Falls back to mtime outside git.
function finishedAt (file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    if (out) return new Date(out)
  } catch { /* not a git repo, or never committed */ }
  return statSync(file).mtime
}

const now = new Date()
const days = d => (now - d) / 86400000

const moves = []
const skipped = []

for (const { file, archived } of contractFiles(contractsDir)) {
  if (archived) continue
  const fm = parseFrontmatter(readFileSync(file, 'utf8'))
  if (fm.error || !fm.data?.id) { skipped.push([file, 'does not parse']); continue }
  if (!FINISHED.includes(fm.data.status)) continue

  const when = finishedAt(file)
  if (olderThan !== null && days(when) < olderThan) continue

  const target = join(archiveDir, String(when.getFullYear()), basename(file))
  if (existsSync(target)) { skipped.push([file, `already archived at ${relative(root, target)}`]); continue }
  moves.push({ file, target, id: fm.data.id, status: fm.data.status, spec: fm.data.spec })
}

// A spec follows its wave: once every contract naming it has been archived, the spec is history too.
// Checked against the whole set — live contracts included — so a half-finished wave keeps its spec.
const specMoves = []
if (existsSync(specsDir)) {
  const all = contractFiles(contractsDir).map(({ file, archived }) => {
    const fm = parseFrontmatter(readFileSync(file, 'utf8'))
    return { spec: fm.data?.spec, status: fm.data?.status, archived, file }
  })
  const movedFiles = new Set(moves.map(m => m.file))
  const bySpec = new Map()
  for (const c of all) {
    if (!c.spec || c.spec === 'none') continue
    const key = c.spec
    const done = c.archived || movedFiles.has(c.file) || FINISHED.includes(c.status)
    bySpec.set(key, (bySpec.get(key) ?? true) && done)
  }
  for (const [spec, allDone] of bySpec) {
    if (!allDone) continue
    const specFile = join(root, spec.endsWith('.md') ? spec : spec + '.md')
    if (!existsSync(specFile)) continue
    if (!relative(specArchiveDir, specFile).startsWith('..')) continue        // already archived
    const target = join(specArchiveDir, String(now.getFullYear()), basename(specFile))
    if (existsSync(target)) { skipped.push([specFile, 'already archived']); continue }
    specMoves.push({ file: specFile, target, id: basename(specFile, '.md') })
  }
}

// ── report and act ───────────────────────────────────────────────────────────

const rel = p => relative(root, p)

if (!moves.length && !specMoves.length) {
  console.log('Nothing to archive — no completed or withdrawn contracts outside the archive' +
    (olderThan !== null ? ` older than ${olderThan} days` : '') + '.')
  for (const [f, why] of skipped) console.log(`  skipped  ${rel(f)} — ${why}`)
  process.exit(0)
}

console.log(dryRun ? 'Would archive:' : 'Archiving:')
for (const m of [...moves, ...specMoves]) {
  console.log(`  ${m.id.padEnd(18)} ${rel(m.file)} → ${rel(m.target)}`)
  if (dryRun) continue
  mkdirSync(dirname(m.target), { recursive: true })
  renameSync(m.file, m.target)
}
for (const [f, why] of skipped) console.log(`  skipped  ${rel(f)} — ${why}`)

console.log(
  `\n${dryRun ? 'Would move' : 'Moved'} ${moves.length} contract${moves.length === 1 ? '' : 's'}` +
  (specMoves.length ? ` and ${specMoves.length} spec${specMoves.length === 1 ? '' : 's'}` : '') +
  `. Statuses are unchanged — archiving is a location, not an outcome.`
)
if (!dryRun) console.log('Run the validator to confirm no reference broke:\n  node scripts/validate-contract.mjs ' + profile.paths.contracts + ' --all')
