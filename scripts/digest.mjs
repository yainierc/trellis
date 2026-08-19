#!/usr/bin/env node
// trellis — what landed, and what somebody should look at.
//
// Asked for out loud, in a meeting, by the person who has to review it in the morning:
//
//   "it's a good idea if we can have an update, the document of what has been in that release …
//    so on the next morning when you open, you see, okay, this change and this is what I need
//    to review."
//
// So this is written for the reader, not for the log. `git log` already lists commits; what it
// cannot tell you is **which contract each change was made under, what that contract promised, and
// what nobody verified** — and that last one is the reason to open it at all.
//
//   node scripts/digest.mjs                     since the last tag, or the last 20 commits
//   node scripts/digest.mjs --since v0.6.0      since a ref
//   node scripts/digest.mjs --since HEAD~10 --markdown > digest.md
//
// Read-only. It never writes into the repository.

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseFrontmatter, doneWhenCriteria } from './lib/frontmatter.mjs'
import { contractFiles } from './lib/contract.mjs'
import { loadProfile } from './lib/profile.mjs'

const args = process.argv.slice(2)
const markdown = args.includes('--markdown')
const sinceIdx = args.indexOf('--since')
let since = sinceIdx === -1 ? null : args[sinceIdx + 1]

let loaded
try { loaded = loadProfile(process.cwd()) } catch (err) { console.error(err.message); process.exit(2) }
if (!loaded) { console.error('no .trellis/profile.yml found — this repository has not adopted trellis'); process.exit(2) }
const { root, profile } = loaded

const git = (...a) => {
  try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}
if (!git('rev-parse', '--is-inside-work-tree')) { console.error('not a git repository — there is no range to summarise'); process.exit(2) }

// Default to the last tag, because that is what "this release" usually means. Falling back to a
// commit count rather than the whole history: a digest of everything is a log, and nobody reads it.
if (!since) since = git('describe', '--tags', '--abbrev=0') || 'HEAD~20'

const range = `${since}..HEAD`
const commits = git('log', range, '--format=%h%x09%s').split('\n').filter(Boolean)
  .map(l => { const [sha, ...rest] = l.split('\t'); return { sha, subject: rest.join('\t') } })
const changed = git('diff', '--name-only', range).split('\n').filter(Boolean)

// ── which contracts landed in this range ─────────────────────────────────────
// A contract counts as landed when its file changed in the range and it is finished. That is more
// honest than reading status alone: a contract completed months ago has not landed *here*.
const contractsDir = join(root, profile.paths.contracts)
const landed = []
for (const { file } of contractFiles(contractsDir)) {
  const rel = relative(root, file)
  const fm = parseFrontmatter(readFileSync(file, 'utf8'))
  if (fm.error || !fm.data?.id) continue
  if (!['completed', 'withdrawn'].includes(fm.data.status)) continue
  // "Landed here" means the status line was set to finished inside this range — not merely that the
  // file moved. Archiving touches every contract it relocates, and a release note that lists work
  // finished six months ago as this week's delivery is worse than no release note.
  const finishedHere = git('log', range, '--format=%h', '-S', `status: ${fm.data.status}`, '--follow', '--', rel)
  if (!finishedHere) continue
  landed.push({
    id: fm.data.id,
    title: fm.data.title,
    status: fm.data.status,
    spec: fm.data.spec,
    writes: fm.data.writes || [],
    criteria: doneWhenCriteria(fm.body)
  })
}

// Files changed under no contract at all. Not an accusation — a rename, a docs fix and a config
// tweak all land this way legitimately. But it is the part of a release nobody promised anything
// about, which makes it exactly what a reviewer should look at first.
const claimed = new Set()
for (const c of landed) {
  for (const w of c.writes) {
    for (const f of changed) if (f === w.replace(/\/$/, '') || f.startsWith(w.replace(/\/$/, '') + '/')) claimed.add(f)
  }
}
// A contract file changing is the orchestrator writing `status` — bookkeeping §2 explicitly allows,
// not work nobody promised. Listing it here would bury the one file that actually deserves the look.
const contractsPath = profile.paths.contracts.replace(/\/$/, '')
const unclaimed = changed.filter(f => !claimed.has(f) && !f.startsWith(contractsPath + '/'))

// ── output ───────────────────────────────────────────────────────────────────
const H = markdown ? (t) => `## ${t}` : (t) => `\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`
const out = []

out.push(markdown ? `# What landed since ${since}` : `What landed since ${since}`)
out.push(`${commits.length} commit${commits.length === 1 ? '' : 's'} · ${changed.length} file${changed.length === 1 ? '' : 's'} changed · ${landed.length} contract${landed.length === 1 ? '' : 's'}`)

if (landed.length) {
  out.push(H('Delivered under contract'))
  for (const c of landed) {
    out.push(`\n**${c.id}** — ${c.title}`)
    if (c.spec && c.spec !== 'none') out.push(`spec: ${c.spec}`)
    const unrunnable = c.criteria.filter(x => !x.command)
    out.push(`${c.criteria.length} acceptance criteria, ${c.criteria.length - unrunnable.length} of them runnable commands`)
    // The honest line. core.md §5: what cannot be executed is reported NOT VERIFIED, never passed.
    if (unrunnable.length) {
      out.push(`**${unrunnable.length} could not be checked by machine — a person has to look:**`)
      for (const u of unrunnable) out.push(`  · ${u.raw}`)
    }
  }
}

if (unclaimed.length) {
  out.push(H('Changed under no contract'))
  out.push('Nobody promised anything about these. Usually fine — renames, docs, config — and the first place to look.')
  for (const f of unclaimed.slice(0, 40)) out.push(`  ${f}`)
  if (unclaimed.length > 40) out.push(`  … and ${unclaimed.length - 40} more`)
}

out.push(H('Commits'))
for (const c of commits.slice(0, 40)) out.push(`  ${c.sha}  ${c.subject}`)
if (commits.length > 40) out.push(`  … and ${commits.length - 40} more`)

if (!landed.length && !commits.length) out.push('\nNothing in this range.')

console.log(out.join('\n'))
