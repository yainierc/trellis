#!/usr/bin/env node
// trellis — hook tests.
//
// Builds a throwaway fixture repository, feeds each handler a synthetic harness event on stdin, and
// asserts what comes back. The fail-open cases are tested as carefully as the denials: a guardrail
// that blocks ordinary work is a worse defect than one that misses a case, because it is the one
// that gets the plugin uninstalled.
//
//   node scripts/test-hooks.mjs

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const HANDLERS = join(ROOT, 'hooks', 'handlers')

let pass = 0
const failures = []

function check (name, condition, detail) {
  if (condition) { pass++; return }
  failures.push(`${name}${detail ? `\n      ${detail}` : ''}`)
}

// ── fixture ──────────────────────────────────────────────────────────────────

const PROFILE = `
project:
  code: fixture
paths:
  contracts: docs/contracts
git:
  base_branch: main
  branch_pattern: "task/{id}-{slug}"
commands:
  build: ~
  lint: "true"
  test_fast: "true"
gates:
  stop:
    - build
    - lint
    - test_fast
    - done_when
`.trimStart()

const contract = (id, criteria, autonomy) => `---
id: ${id}
title: Fixture
spec: none
status: active
executor: subagent
agent: implementer
model: sonnet
estimate: 60min${autonomy ? `\nautonomy: ${autonomy}` : ''}
depends_on: []
parallel_safe_with: []
reads: []
writes:
  - src/allowed/
  - docs/notes.md
gates: none
---

# ${id} — Fixture

## Objective
Exercise the hooks.

## Constraints
- none

## Steps
1. none

## Done when
${criteria}

## Out of scope
- none
`

function makeRepo ({ branch = 'task/FIX-T-01-thing', criteria = '- [ ] `true`',
                     profileAutonomy = null, deployOnMerge = null, contractAutonomy = null,
                     remote = null, noGit = false, active = null } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-fixture-')))
  const git = (...a) => noGit ? undefined : execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.com')
  git('config', 'user.name', 'fixture')

  mkdirSync(join(dir, '.trellis'), { recursive: true })
  let profile = PROFILE
  if (profileAutonomy) profile = profile.replace('project:\n  code: fixture', `project:\n  code: fixture\n  autonomy: ${profileAutonomy}`)
  if (deployOnMerge !== null) profile = profile.replace('  base_branch: main', `  base_branch: main\n  deploy_on_merge: ${deployOnMerge}`)
  writeFileSync(join(dir, '.trellis', 'profile.yml'), profile)
  mkdirSync(join(dir, 'docs', 'contracts'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'contracts', 'FIX-T-01.md'), contract('FIX-T-01', criteria, contractAutonomy))
  mkdirSync(join(dir, 'src', 'allowed'), { recursive: true })
  writeFileSync(join(dir, 'README.md'), 'fixture\n')

  git('add', '-A')
  git('commit', '-qm', 'fixture')
  if (remote) git('remote', 'add', 'origin', remote)
  if (branch !== 'main' && !noGit) git('checkout', '-qb', branch)
  if (active) writeFileSync(join(dir, '.trellis', 'active'), active + '\n')
  return dir
}

// ── driver ───────────────────────────────────────────────────────────────────

function fire (handler, event) {
  const r = spawnSync('node', [join(HANDLERS, handler)], {
    input: JSON.stringify(event), encoding: 'utf8'
  })
  if (r.status !== 0) return { exit: r.status, error: r.stderr, out: {} }
  let out = {}
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : {} } catch { out = { unparsed: r.stdout } }
  return { exit: r.status, out }
}

const decision = res => res.out?.hookSpecificOutput?.permissionDecision || null
const reason = res => res.out?.hookSpecificOutput?.permissionDecisionReason || ''
const write = (cwd, path) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd, tool_input: { file_path: path } })
const bash = (cwd, command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd, tool_input: { command } })

const cleanup = []
const repo = opts => { const d = makeRepo(opts); cleanup.push(d); return d }

// ── write boundary ───────────────────────────────────────────────────────────
{
  const dir = repo()

  let r = fire('write-boundary.mjs', write(dir, join(dir, 'src/allowed/Thing.ts')))
  check('write inside `writes` is allowed', decision(r) === null, `got ${decision(r)}: ${reason(r)}`)

  r = fire('write-boundary.mjs', write(dir, join(dir, 'src/elsewhere/Other.ts')))
  check('write outside `writes` is denied', decision(r) === 'deny', `got ${decision(r)}`)
  check('the denial names the declared paths', /src\/allowed/.test(reason(r)), reason(r))

  r = fire('write-boundary.mjs', write(dir, join(dir, 'docs/contracts/FIX-T-01.md')))
  check('editing the active contract is denied (§2)', decision(r) === 'deny', `got ${decision(r)}`)
  check('the §2 denial explains why', /never edits its own/.test(reason(r)), reason(r))

  r = fire('write-boundary.mjs', write(dir, '/etc/hosts'))
  check('write outside the worktree is denied (§3)', decision(r) === 'deny', `got ${decision(r)}`)

  // prefix-aware by segment: a sibling that merely shares a string prefix is NOT covered
  r = fire('write-boundary.mjs', write(dir, join(dir, 'src/allowed.bak/x.ts')))
  check('src/allowed.bak/ does not match src/allowed/', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('write-boundary.mjs', write(dir, join(dir, 'docs/notes.md')))
  check('a file entry in `writes` matches exactly', decision(r) === null, `got ${decision(r)}`)
}

// ── fail open ────────────────────────────────────────────────────────────────
{
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-bare-')))
  cleanup.push(bare)
  const r = fire('write-boundary.mjs', write(bare, join(bare, 'anything.ts')))
  check('an ungoverned repo is left alone', decision(r) === null && !r.out.systemMessage, JSON.stringify(r.out))

  const onMain = repo({ branch: 'main' })
  const r2 = fire('write-boundary.mjs', write(onMain, join(onMain, 'src/elsewhere/Other.ts')))
  check('no contract in flight means no boundary', decision(r2) === null, `got ${decision(r2)}`)

  const wrong = repo({ branch: 'task/NOPE-T-99-ghost' })
  const r3 = fire('write-boundary.mjs', write(wrong, join(wrong, 'src/elsewhere/Other.ts')))
  check('a branch naming a missing contract is reported, not enforced', decision(r3) === null && /NOT being enforced/.test(r3.out.systemMessage || ''), JSON.stringify(r3.out))
}

// ── git boundary ─────────────────────────────────────────────────────────────
{
  const dir = repo()

  let r = fire('git-boundary.mjs', bash(dir, 'git status --short'))
  check('git status is allowed', decision(r) === null, `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'git commit -m "work"'))
  check('committing in the worktree is allowed (§7)', decision(r) === null, `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'git push'))
  check('push under an active contract is denied (§7)', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'FOO=1 git push origin HEAD'))
  check('a leading assignment does not hide the push', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'npm test && git rebase main'))
  check('a chained rebase is caught (§7)', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'gh pr create --fill'))
  check('opening a PR is denied (§4)', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'git checkout main'))
  check('switching branches is denied (§7)', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(dir, 'git checkout -- src/allowed/x.ts'))
  check('discarding a file is not a branch switch', decision(r) === null, `got ${decision(r)}: ${reason(r)}`)

  const onMain = repo({ branch: 'main' })
  r = fire('git-boundary.mjs', bash(onMain, 'git push origin main'))
  check('pushing to the base branch is denied even with no contract (§4)', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(onMain, 'git push --force origin feature'))
  check('force-push is always denied (§4)', decision(r) === 'deny', `got ${decision(r)}`)

  r = fire('git-boundary.mjs', bash(onMain, 'git log --oneline -5'))
  check('reading history is left alone outside a contract', decision(r) === null, `got ${decision(r)}`)
}

// ── no git at all ────────────────────────────────────────────────────────────
//
// A folder of requirement documents, with no repository, is a repo Trellis can govern. Only
// *automatic* contract resolution needs git, because it reads the branch name; `.trellis/active` is
// the explicit substitute and it is the reason this whole path works.
{
  const docs = repo({ noGit: true })

  let r = fire('write-boundary.mjs', write(docs, join(docs, 'anything.txt')))
  check('git-less: inert with no marker', decision(r) === null && !r.out.systemMessage, JSON.stringify(r.out))

  const marked = repo({ noGit: true, active: 'FIX-T-01' })

  r = fire('write-boundary.mjs', write(marked, join(marked, 'src/allowed/x.ts')))
  check('git-less: .trellis/active allows inside `writes`', decision(r) === null, `got ${decision(r)}: ${reason(r)}`)

  r = fire('write-boundary.mjs', write(marked, join(marked, 'docs/Requirements.docx')))
  check('git-less: .trellis/active denies outside `writes`', decision(r) === 'deny', `got ${decision(r)}`)
  check('git-less: the denial still names the contract', /FIX-T-01/.test(reason(r)), reason(r))

  r = fire('stop-gate.mjs', { hook_event_name: 'Stop', cwd: marked })
  check('git-less: the Stop gate runs without a repository', /passed the Stop gate/.test(r.out.systemMessage || ''), JSON.stringify(r.out))

  // an id that matches nothing is a broken context, not an absent one — same as a bad branch name
  const ghost = repo({ noGit: true, active: 'NOPE-T-99' })
  r = fire('write-boundary.mjs', write(ghost, join(ghost, 'anything.txt')))
  check('git-less: a marker naming a missing contract is reported',
    decision(r) === null && /NOT being enforced/.test(r.out.systemMessage || ''), JSON.stringify(r.out))
}

// ── graduated autonomy ───────────────────────────────────────────────────────
//
// Every precondition is asserted to deny on its own. There is no test that merges anything: the
// allowed path ends at `gh pr merge --auto`, which is a request to the platform, and the platform is
// the one thing a fixture cannot stand in for.
{
  const GH = 'https://github.com/example/fixture.git'
  const full = {
    profileAutonomy: 'auto-merge', deployOnMerge: 'false',
    contractAutonomy: 'autonomous', remote: GH
  }

  // 1 · nothing granted at all — the default path is unchanged
  let dir = repo({ remote: GH })
  let r = fire('git-boundary.mjs', bash(dir, 'git push -u origin HEAD'))
  check('autonomy: push denied when nothing was granted', decision(r) === 'deny', `got ${decision(r)}`)
  check('autonomy: the refusal names the profile ceiling', /profile declares autonomy/.test(reason(r)), reason(r))

  // 2 · repo permits it, contract never asked
  dir = repo({ ...full, contractAutonomy: null })
  r = fire('git-boundary.mjs', bash(dir, 'gh pr create --fill'))
  check('autonomy: denied when the contract was not granted it', decision(r) === 'deny', `got ${decision(r)}`)
  check('autonomy: the refusal says the contract was not granted', /was not granted autonomy/.test(reason(r)), reason(r))

  // 3 · contract asks, repo ceiling forbids — min(ceiling, grant) wins
  dir = repo({ ...full, profileAutonomy: 'pr' })
  r = fire('git-boundary.mjs', bash(dir, 'gh pr create --fill'))
  check('autonomy: the repo ceiling beats the contract grant', decision(r) === 'deny', `got ${decision(r)}`)

  // 4 · deploy_on_merge unanswered is a refusal, not an assumption
  dir = repo({ ...full, deployOnMerge: null })
  r = fire('git-boundary.mjs', bash(dir, 'git push -u origin HEAD'))
  check('autonomy: unanswered deploy_on_merge refuses', decision(r) === 'deny', `got ${decision(r)}`)
  check('autonomy: it says the question is unanswered', /deploy_on_merge is unanswered/.test(reason(r)), reason(r))

  // 5 · a merge that deploys disqualifies the repo
  dir = repo({ ...full, deployOnMerge: 'true' })
  r = fire('git-boundary.mjs', bash(dir, 'git push -u origin HEAD'))
  check('autonomy: deploy_on_merge true disqualifies', decision(r) === 'deny', `got ${decision(r)}`)
  check('autonomy: it says auto-merge would be auto-deploy', /auto-deploy/.test(reason(r)), reason(r))

  // 6 · everything granted, but the branch is not protected → exceptions fail closed
  dir = repo(full)
  r = fire('git-boundary.mjs', bash(dir, 'git push -u origin HEAD'))
  check('autonomy: fails closed when protection cannot be verified', decision(r) === 'deny', `got ${decision(r)}`)
  check('autonomy: the refusal is about the platform, not the grant',
    /protection|required status checks|could not be verified|gh CLI/.test(reason(r)), reason(r))

  // 7 · a bare merge stays denied even with everything granted
  r = fire('git-boundary.mjs', bash(dir, 'gh pr merge --squash'))
  check('autonomy: a bare gh pr merge is denied at every level', decision(r) === 'deny', `got ${decision(r)}`)
  check('autonomy: it explains that --auto delegates and a bare merge does not',
    /--auto/.test(reason(r)), reason(r))

  // 8 · pushing the base branch is never relaxed
  const onMain = repo({ ...full, branch: 'main' })
  r = fire('git-boundary.mjs', bash(onMain, 'git push origin main'))
  check('autonomy: pushing the base branch is never relaxed', decision(r) === 'deny', `got ${decision(r)}`)

  // 9 · force-push is never relaxed
  r = fire('git-boundary.mjs', bash(dir, 'git push --force origin HEAD'))
  check('autonomy: force-push is never relaxed', decision(r) === 'deny', `got ${decision(r)}`)

  // 10 · an ordinary command still costs no API call and is still allowed
  r = fire('git-boundary.mjs', bash(dir, 'git status --short'))
  check('autonomy: ordinary git is untouched by any of this', decision(r) === null, `got ${decision(r)}`)
}

// ── stop gate ────────────────────────────────────────────────────────────────
{
  const green = repo({ criteria: '- [ ] `true`\n- [ ] `test 1 = 1`' })
  let r = fire('stop-gate.mjs', { hook_event_name: 'Stop', cwd: green })
  check('the gate never exits 2', r.exit === 0, `exit ${r.exit}`)
  check('a green contract passes the gate', /passed the Stop gate/.test(r.out.systemMessage || ''), JSON.stringify(r.out))
  check('a passing contract keeps its status', /status:\s*active/.test(readFileSync(join(green, 'docs/contracts/FIX-T-01.md'), 'utf8')))
  check('a skipped `~` command is stated, not hidden', /skipped/.test(r.out.additionalContext || ''), r.out.additionalContext)

  const red = repo({ criteria: '- [ ] `false`' })
  r = fire('stop-gate.mjs', { hook_event_name: 'Stop', cwd: red })
  check('a failing criterion does not exit 2 either (§8)', r.exit === 0, `exit ${r.exit}`)
  check('a failing contract is marked blocked', /status:\s*blocked/.test(readFileSync(join(red, 'docs/contracts/FIX-T-01.md'), 'utf8')))
  check('the failure is surfaced to the human', /FAILED the Stop gate/.test(r.out.systemMessage || ''), JSON.stringify(r.out))
  check('the model is told not to report it complete', /Do NOT report this contract as complete/.test(r.out.additionalContext || ''))

  const unrunnable = repo({ criteria: '- [ ] the reviewer is happy with it' })
  r = fire('stop-gate.mjs', { hook_event_name: 'Stop', cwd: unrunnable })
  check('an unrunnable criterion is NOT VERIFIED, never a pass (§5)', /NOT VERIFIED/.test(r.out.additionalContext || ''), r.out.additionalContext)
  check('NOT VERIFIED blocks the contract', /status:\s*blocked/.test(readFileSync(join(unrunnable, 'docs/contracts/FIX-T-01.md'), 'utf8')))

  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-bare-')))
  cleanup.push(bare)
  r = fire('stop-gate.mjs', { hook_event_name: 'Stop', cwd: bare })
  check('an ungoverned repo stops normally', r.exit === 0 && !r.out.systemMessage, JSON.stringify(r.out))
}

// ── archiving ────────────────────────────────────────────────────────────────
//
// The property the whole feature turns on: a live contract may depend on one that was archived
// months ago, and the validator must stay quiet. If archiving can break the graph, nobody will ever
// run it, and the decay signal core.md §10 names stays open forever.
{
  const dir = repo()
  const VALIDATE = join(ROOT, 'scripts', 'validate-contract.mjs')
  const ARCHIVE = join(ROOT, 'scripts', 'archive.mjs')
  const run = (script, args, cwd) => spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' })

  // FIX-T-01 exists and is active. Add a finished one, and a live one that depends on it.
  const c = (id, status, deps) => contract(id, '- [ ] `true`').
    replace(/^status: active$/m, `status: ${status}`).
    replace(/^id: FIX-T-01$/m, `id: ${id}`).
    replace(/^depends_on: \[\]$/m, `depends_on: ${JSON.stringify(deps || [])}`)
  writeFileSync(join(dir, 'docs/contracts/OLD-T-01.md'), c('OLD-T-01', 'completed'))
  writeFileSync(join(dir, 'docs/contracts/NEW-T-01.md'), c('NEW-T-01', 'pending', ['OLD-T-01']))

  let r = run(VALIDATE, ['docs/contracts', '--all'], dir)
  check('archive: the graph is clean before archiving', r.status === 0, r.stdout)

  r = run(ARCHIVE, ['--dry-run'], dir)
  check('archive: --dry-run exits 0', r.status === 0, r.stderr)
  check('archive: --dry-run names the finished contract', /OLD-T-01/.test(r.stdout), r.stdout)
  check('archive: --dry-run moves nothing', existsSync(join(dir, 'docs/contracts/OLD-T-01.md')))

  r = run(ARCHIVE, [], dir)
  check('archive: the real run exits 0', r.status === 0, r.stderr)
  check('archive: the finished contract left the working set', !existsSync(join(dir, 'docs/contracts/OLD-T-01.md')))
  check('archive: it landed under archive/<year>/',
    existsSync(join(dir, `docs/contracts/archive/${new Date().getFullYear()}/OLD-T-01.md`)))
  check('archive: the live one stayed put', existsSync(join(dir, 'docs/contracts/NEW-T-01.md')))
  check('archive: status is untouched — location is not an outcome',
    /^status: completed$/m.test(readFileSync(join(dir, `docs/contracts/archive/${new Date().getFullYear()}/OLD-T-01.md`), 'utf8')))

  // the property
  r = run(VALIDATE, ['docs/contracts', '--all'], dir)
  check('archive: depends_on across the boundary still resolves', r.status === 0, r.stdout)
  check('archive: the archived one is not counted as live', /1 archived/.test(r.stdout), r.stdout)

  r = run(ARCHIVE, [], dir)
  check('archive: running it twice is a no-op', /Nothing to archive/.test(r.stdout), r.stdout)
}

// ── report ───────────────────────────────────────────────────────────────────

for (const d of cleanup) { try { rmSync(d, { recursive: true, force: true }) } catch {} }

if (failures.length) {
  console.log(`\n✗ ${failures.length} failed, ${pass} passed\n`)
  for (const f of failures) console.log(`    FAIL  ${f}`)
  process.exit(1)
}
console.log(`✓ ${pass} hook checks passed`)
