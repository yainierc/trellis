#!/usr/bin/env node
// trellis — what may run right now, and what will collide if it does.
//
// `rules/core.md` §7: *"Parallel work runs one worktree per contract, every worktree branched from the
// same base commit, recorded. Integration happens only after the whole wave is green."*
//
// Three profile fields were written to serve that rule and read by nothing — `concurrency.max_parallel`,
// `concurrency.ceilings`, `git.worktree_root`. The `ceilings` comment even says *"state them or the
// fleet will exceed them"*. This is the fleet.
//
//   node fleet-plan.mjs <contracts dir>            what is runnable, and why the rest is not
//   node fleet-plan.mjs <contracts dir> --record   also write .trellis/wave.json with the base commit
//   node fleet-plan.mjs --wave                     read back the recorded wave and each contract's state
//
// It computes and reports. It creates no worktree, starts nothing, and merges nothing — those need a
// conversation and a subagent, which is `/trellis:fleet`'s job.
//
// A contract is runnable when ALL of these hold:
//   · status is `pending`
//   · every id in `depends_on` resolves to a contract that is `completed`
//   · it does not overlap, by path segment, with anything already chosen for this wave
//
// The third is why the set is computed rather than judged: two contracts may each be individually
// runnable and still not be runnable *together*.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseFrontmatter } from './lib/frontmatter.mjs'
import { contractFiles } from './lib/contract.mjs'
import { loadProfile } from './lib/profile.mjs'
import { overlap } from './lib/paths.mjs'

const args = process.argv.slice(2)
const record = args.includes('--record')
const showWave = args.includes('--wave')
const dirArg = args.find(a => !a.startsWith('--'))

let loaded
try { loaded = loadProfile(process.cwd()) } catch (err) { console.error(err.message); process.exit(2) }
if (!loaded) { console.error('no .trellis/profile.yml found — this repository has not adopted trellis'); process.exit(2) }
const { root, profile } = loaded

const contractsDir = join(root, dirArg || profile.paths.contracts)
const wavePath = join(root, '.trellis', 'wave.json')

const git = (...a) => {
  try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}

// ── read every contract once ─────────────────────────────────────────────────
const all = []
for (const { file, archived } of contractFiles(contractsDir)) {
  const fm = parseFrontmatter(readFileSync(file, 'utf8'))
  if (fm.error || !fm.data?.id) continue
  all.push({
    file,
    archived,
    id: fm.data.id,
    title: fm.data.title,
    status: fm.data.status,
    slug: String(fm.data.title || fm.data.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40),
    writes: fm.data.writes || [],
    depends: fm.data.depends_on || [],
    autonomy: fm.data.autonomy || 'supervised'
  })
}
const byId = new Map(all.map(c => [c.id, c]))

// ── --wave: read back what was launched, and where each one got to ───────────
if (showWave) {
  if (!existsSync(wavePath)) { console.log('No wave recorded. Nothing was launched from this checkout.'); process.exit(0) }
  const wave = JSON.parse(readFileSync(wavePath, 'utf8'))
  console.log(`Wave recorded ${wave.launched_at}`)
  console.log(`Base commit  ${wave.base_commit}   (${wave.base_branch})`)
  console.log('')
  let green = 0; let blocked = 0; let running = 0
  for (const id of wave.contracts) {
    const c = byId.get(id)
    const state = c ? c.status : 'MISSING'
    if (state === 'completed') green++
    else if (state === 'blocked') blocked++
    else running++
    console.log(`  ${state.padEnd(10)} ${id}${c ? '' : '  — not found under ' + profile.paths.contracts}`)
  }
  console.log('')
  // §7: integration happens only after the WHOLE wave is green. A partial merge leaves a hybrid tree.
  if (blocked) {
    console.log(`${blocked} blocked. Integration of the whole wave is held — including the ${green} that passed.`)
    console.log('Partial integration leaves a hybrid tree when a late contract fails (core.md §7).')
  } else if (running) {
    console.log(`${running} still in flight. Nothing integrates until the wave is green.`)
  } else {
    console.log('Wave is green. Integration is a human act — nothing here merges anything.')
  }
  process.exit(blocked ? 1 : 0)
}

// ── the runnable set ─────────────────────────────────────────────────────────
const reasons = []
const candidates = all.filter(c => {
  if (c.archived) return false
  if (c.status !== 'pending') { if (['active', 'blocked', 'gated'].includes(c.status)) reasons.push([c.id, `status is ${c.status}`]); return false }
  const unmet = c.depends.filter(d => byId.get(d)?.status !== 'completed')
  if (unmet.length) { reasons.push([c.id, `waiting on ${unmet.join(', ')}`]); return false }
  return true
})

// Greedy by declaration order: a stable set beats an optimal one nobody can predict.
const chosen = []
for (const c of candidates) {
  const clash = chosen.find(o => overlap(c.writes, o.writes).length)
  if (clash) { reasons.push([c.id, `writes overlap with ${clash.id} — not in this wave`]); continue }
  chosen.push(c)
}

const maxParallel = Number(profile.concurrency?.max_parallel ?? 4)
const capped = chosen.slice(0, maxParallel)
for (const c of chosen.slice(maxParallel)) reasons.push([c.id, `over max_parallel (${maxParallel}) — next wave`])

// ── report ───────────────────────────────────────────────────────────────────
const inFlight = all.filter(c => c.status === 'active' && !c.archived)
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const base = profile.git.base_branch

console.log(`Runnable now: ${capped.length}${chosen.length > capped.length ? ` of ${chosen.length} eligible` : ''}\n`)
for (const c of capped) {
  console.log(`  ${c.id.padEnd(16)} ${c.title || ''}`)
  console.log(`  ${' '.repeat(16)} writes: ${c.writes.join(', ') || '(none)'}`)
  console.log(`  ${' '.repeat(16)} worktree: ${profile.git.worktree_root}/${c.id}   branch: task/${c.id}-${c.slug}`)
}
if (!capped.length) console.log('  (nothing)')

if (reasons.length) {
  console.log('\nHeld back:')
  for (const [id, why] of reasons) console.log(`  ${id.padEnd(16)} ${why}`)
}

// ── the things that make a fleet fail in ways that look like broken code ─────
const problems = []
if (branch && branch !== base) problems.push(`this checkout is on "${branch}", not the base branch "${base}" — every worktree must branch from one recorded base commit (§7)`)
if (inFlight.length) problems.push(`${inFlight.map(c => c.id).join(', ')} already active — finish or block them before launching a wave`)

const ceilings = profile.concurrency?.ceilings
if (ceilings === 'none' || ceilings === null || ceilings === undefined) {
  console.log(
    '\n⚠ concurrency.ceilings is unstated. Ports, licence seats and shared databases are not about\n' +
    '  tokens: four worktrees contending for one dev-server port fails in a way that looks exactly\n' +
    `  like broken code. State them, or state \`none\` deliberately. (${capped.length} would launch.)`
  )
} else {
  console.log(`\nCeilings declared: ${typeof ceilings === 'string' ? ceilings : JSON.stringify(ceilings)}`)
  console.log('  Check the wave against them before launching — nothing here can.')
}

if (problems.length) {
  console.log('\nCannot launch:')
  for (const p of problems) console.log(`  ✗ ${p}`)
}

// ── --record: fix the base commit for the wave ───────────────────────────────
if (record) {
  if (problems.length) { console.error('\nRefusing to record a wave while the above holds.'); process.exit(1) }
  if (!capped.length) { console.error('\nNothing runnable — no wave to record.'); process.exit(1) }
  const sha = git('rev-parse', 'HEAD')
  if (!sha) { console.error('\ncannot resolve HEAD — a wave needs a recorded base commit (§7)'); process.exit(1) }
  const wave = {
    launched_at: git('log', '-1', '--format=%cI') || 'unknown',
    base_branch: base,
    base_commit: sha,
    max_parallel: maxParallel,
    contracts: capped.map(c => c.id),
    worktrees: Object.fromEntries(capped.map(c => [c.id, `${profile.git.worktree_root}/${c.id}`]))
  }
  mkdirSync(dirname(wavePath), { recursive: true })
  writeFileSync(wavePath, JSON.stringify(wave, null, 2) + '\n')
  console.log(`\nRecorded .trellis/wave.json — base ${sha.slice(0, 8)}, ${capped.length} contracts.`)
  console.log('Gitignore it: it is local execution state, not a shared decision.')
}

process.exit(problems.length ? 1 : 0)
