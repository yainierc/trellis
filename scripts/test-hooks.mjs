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

// ── specs: owner, and questions with an address ──────────────────────────────
{
  const VS = join(ROOT, 'scripts', 'validate-spec.mjs')
  const Q = join(ROOT, 'scripts', 'questions.mjs')
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-spec-')))
  cleanup.push(dir)
  const run = (script, args) => spawnSync('node', [script, ...args], { encoding: 'utf8' })

  const spec = (over = {}) => `---
id: ${over.id || 'demo'}
title: Demo
status: ${over.status || 'draft'}
owner: ${over.owner === undefined ? '~' : over.owner}
date: 2026-08-19
supersedes: none
contracts: []
feature_flag: none
flag_reason: >-
  A folded block scalar, which is what every real spec uses and what the reader could not read.
e2e: none
e2e_reason: none needed
ceilings: none
---
# demo
## Why
x
## Outcome
x
## Decisions
x
## Out of scope
- none
## Open questions
${over.questions || `### APN Leadership

**Q-01 · Does the marketplace take the booking, or pass a lead to the FBO?**

The brief asserts both.

- **If nobody answers:** the manual-confirmation shape ships by default and the race is found by a customer.
- **Detail:** W1 vs W3.`}
`
  const write = (name, body) => { const f = join(dir, name); writeFileSync(f, body); return f }

  // the block scalar the real specs exposed
  let r = run(VS, [write('folded.md', spec())])
  check('spec: a folded block scalar parses', !/neither a key nor a list item/.test(r.stdout), r.stdout)

  check('spec: a draft with no owner is a warning, not an error', r.status === 0 && /owner is unset/.test(r.stdout), r.stdout)

  r = run(VS, [write('approved.md', spec({ status: 'approved' }))])
  check('spec: approved with no owner is an ERROR', r.status === 1 && /no address/.test(r.stdout), r.stdout)

  r = run(VS, [write('owned.md', spec({ status: 'approved', owner: 'APN Leadership' }))])
  check('spec: a role is a valid owner', r.status === 0, r.stdout)

  r = run(VS, [write('nodefault.md', spec({
    questions: '### APN Leadership\n\n**Q-01 · A question with no stated default?**\n\nContext.\n\n- **Detail:** x.'
  }))])
  check('spec: a question with no "If nobody answers" is warned', /do not say what ships/.test(r.stdout), r.stdout)

  // the extractor
  const owned = write('extract.md', spec({ status: 'approved', owner: 'APN Leadership' }))
  r = run(Q, [owned, '--list'])
  check('questions: --list names the audience', r.status === 0 && /APN Leadership/.test(r.stdout), r.stdout)
  r = run(Q, [owned, '--for', 'apn leadership'])
  check('questions: --for matches case-insensitively', r.status === 0 && /Q-01/.test(r.stdout), r.stdout)
  check('questions: the output carries the default', /ships by default/.test(r.stdout), r.stdout)
  r = run(Q, [owned, '--for', 'nobody'])
  check('questions: an unknown audience exits non-zero', r.status === 1, r.stdout)
}

// ── digest ───────────────────────────────────────────────────────────────────
{
  const D = join(ROOT, 'scripts', 'digest.mjs')
  const dir = repo()
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  const run = (args) => spawnSync('node', [D, ...args], { cwd: dir, encoding: 'utf8' })

  git('checkout', '-q', 'main')
  git('tag', 'base')
  // one finished contract, one still pending, one file nobody promised anything about
  const c = (id, status) => contract(id, '- [ ] `true`\n- [ ] the reviewer is happy')
    .replace(/^status: active$/m, `status: ${status}`).replace(/^id: FIX-T-01$/m, `id: ${id}`)
  writeFileSync(join(dir, 'docs/contracts/DONE-T-01.md'), c('DONE-T-01', 'completed'))
  writeFileSync(join(dir, 'docs/contracts/OPEN-T-01.md'), c('OPEN-T-01', 'pending'))
  writeFileSync(join(dir, 'unpromised.txt'), 'nobody declared this\n')
  git('add', '-A'); git('commit', '-qm', 'work')

  let r = run(['--since', 'base'])
  check('digest: exits 0', r.status === 0, r.stderr)
  check('digest: names the finished contract', /DONE-T-01/.test(r.stdout), r.stdout)
  const delivered = (r.stdout.split(/── Delivered under contract/)[1] || '').split(/──/)[0]
  check('digest: does not claim the pending one landed', !/OPEN-T-01/.test(delivered), delivered)
  check('digest: contract bookkeeping is not listed as unpromised work',
    !/docs\/contracts\//.test(r.stdout.split(/Changed under no contract/)[1] || ''), r.stdout)
  check('digest: flags the file under no contract', /unpromised\.txt/.test(r.stdout), r.stdout)
  check('digest: reports what a machine could not check',
    /could not be checked by machine/.test(r.stdout), r.stdout)
  check('digest: writes nothing into the repo',
    execFileSync('git', ['status', '--short'], { cwd: dir, encoding: 'utf8' }).trim() === '')

  r = run(['--since', 'HEAD'])
  check('digest: an empty range says so', /Nothing in this range/.test(r.stdout), r.stdout)
}

// ── per-person areas, and a derived parallel matrix ──────────────────────────
{
  const PM = join(ROOT, 'scripts', 'parallel-matrix.mjs')
  const VC = join(ROOT, 'scripts', 'validate-contract.mjs')

  // ── the agent area table ──
  // FIX-T-01 declares writes: src/allowed/ and docs/notes.md. Give "implementer" only the first.
  const dir = repo()
  const prof = join(dir, '.trellis', 'profile.yml')
  writeFileSync(prof, readFileSync(prof, 'utf8') + 'agents:\n  implementer:\n    - src/allowed/\n')

  const withAgent = (cwd, path, agent_type) =>
    ({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd, agent_id: 'a1', agent_type, tool_input: { file_path: path } })

  let r = fire('write-boundary.mjs', withAgent(dir, join(dir, 'src/allowed/x.ts'), 'implementer'))
  check('areas: inside both writes and the role area is allowed', decision(r) === null, `${decision(r)}: ${reason(r)}`)

  r = fire('write-boundary.mjs', withAgent(dir, join(dir, 'docs/notes.md'), 'implementer'))
  // Escalate, not deny: crossing an ownership boundary is often legitimate — one person is frequently
  // both business and developer — and what matters is that they know they are doing it.
  check('areas: crossing into another area ESCALATES to the human', decision(r) === 'escalate', `got ${decision(r)}`)
  check('areas: the prompt names what the role owns', /Owned by "implementer": src\/allowed\//.test(reason(r)), reason(r))
  check('areas: and invites them to confirm', /Confirm if you know/.test(reason(r)), reason(r))

  r = fire('write-boundary.mjs', withAgent(dir, join(dir, 'docs/notes.md'), 'stranger'))
  check('areas: an unlisted role still writes nothing', decision(r) === 'deny', `got ${decision(r)}`)
  check('areas: it says why', /not listed/.test(reason(r)), reason(r))

  // A human session carries no agent_type. With no local role configured the table cannot apply.
  r = fire('write-boundary.mjs', write(dir, join(dir, 'docs/notes.md')))
  check('areas: a session with no role configured is not bound', decision(r) === null, `${decision(r)}: ${reason(r)}`)

  // But a person who identified themselves gets the same prompt a subagent would — the same pattern
  // the profile already uses for tracker identity: local git config, never committed.
  execFileSync('git', ['config', 'trellis.role', 'implementer'], { cwd: dir, stdio: 'ignore' })
  r = fire('write-boundary.mjs', write(dir, join(dir, 'docs/notes.md')))
  check('areas: a human with a configured role is asked too', decision(r) === 'escalate', `got ${decision(r)}`)
  r = fire('write-boundary.mjs', write(dir, join(dir, 'src/allowed/x.ts')))
  check('areas: inside their own area they are not asked', decision(r) === null, `${decision(r)}: ${reason(r)}`)
  execFileSync('git', ['config', '--unset', 'trellis.role'], { cwd: dir, stdio: 'ignore' })

  // ── the derived matrix ──
  const m = repo()
  const c = (id, writes, deps) => contract(id, '- [ ] `true`')
    .replace(/^id: FIX-T-01$/m, `id: ${id}`)
    .replace(/^status: active$/m, 'status: pending')
    .replace(/^depends_on: \[\]$/m, `depends_on: ${JSON.stringify(deps || [])}`)
    .replace(/^parallel_safe_with: \[\]$/m, 'parallel_safe_with: [A-T-01, B-T-01, C-T-01]')
    .replace(/writes:\n  - src\/allowed\/\n  - docs\/notes\.md/, `writes:\n${writes.map(w => `  - ${w}`).join('\n')}`)
  writeFileSync(join(m, 'docs/contracts/A-T-01.md'), c('A-T-01', ['src/a/'], ['C-T-01']))
  writeFileSync(join(m, 'docs/contracts/B-T-01.md'), c('B-T-01', ['src/b/'], []))
  writeFileSync(join(m, 'docs/contracts/C-T-01.md'), c('C-T-01', ['src/c/'], ['B-T-01']))
  // D shares nothing and depends on nothing, so it is genuinely parallel-safe with all three —
  // without it every derived list is empty and the test proves only that nothing is ever safe.
  writeFileSync(join(m, 'docs/contracts/D-T-01.md'), c('D-T-01', ['src/d/'], []))

  let p = spawnSync('node', [PM, 'docs/contracts'], { cwd: m, encoding: 'utf8' })
  check('parallel-matrix: an overclaim fails the run', p.status === 1, p.stdout)
  check('parallel-matrix: it names the unsafe claim', /CLAIMED BUT UNSAFE/.test(p.stdout), p.stdout)
  // A depends on C, C depends on B ⇒ A and B are transitively related despite disjoint writes.
  // Read A's derived line directly rather than splitting the report — a fragile parse here would
  // pass on a broken derivation.
  const derivedFor = (id, out) => {
    const lines = out.split('\n')
    const i = lines.findIndex(l => l.trim() === id)
    return i === -1 ? '' : (lines[i + 1] || '')
  }
  const aDerived = derivedFor('A-T-01', p.stdout)
  check('parallel-matrix: a transitive ancestor is not parallel-safe', !/B-T-01/.test(aDerived), aDerived)
  check('parallel-matrix: an unrelated contract with disjoint writes IS safe', /D-T-01/.test(aDerived), aDerived)

  p = spawnSync('node', [PM, 'docs/contracts', '--write'], { cwd: m, encoding: 'utf8' })
  check('parallel-matrix: --write exits 0', p.status === 0, p.stdout)
  p = spawnSync('node', [PM, 'docs/contracts'], { cwd: m, encoding: 'utf8' })
  check('parallel-matrix: after writing, declaration matches derivation',
    /Every declaration matches/.test(p.stdout), p.stdout)
  p = spawnSync('node', [VC, 'docs/contracts', '--all'], { cwd: m, encoding: 'utf8' })
  check('parallel-matrix: the validator agrees with what was written', p.status === 0, p.stdout)
}

// ── the fleet ────────────────────────────────────────────────────────────────
//
// Every decision the launcher makes BEFORE starting anything, which is where its failures live. The
// launch itself needs live subagents and a fixture cannot be one.
{
  const FP = join(ROOT, 'scripts', 'fleet-plan.mjs')
  const dir = repo({ branch: 'main' })
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  const plan = (...a) => spawnSync('node', [FP, ...a], { cwd: dir, encoding: 'utf8' })

  const c = (id, opts = {}) => contract(id, '- [ ] `true`')
    .replace(/^id: FIX-T-01$/m, `id: ${id}`)
    .replace(/^status: active$/m, `status: ${opts.status || 'pending'}`)
    .replace(/^depends_on: \[\]$/m, `depends_on: ${JSON.stringify(opts.depends || [])}`)
    .replace(/writes:\n  - src\/allowed\/\n  - docs\/notes\.md/, `writes:\n${(opts.writes || ['src/x/']).map(w => `  - ${w}`).join('\n')}`)

  const put = (id, opts) => writeFileSync(join(dir, 'docs/contracts', id + '.md'), c(id, opts))
  execFileSync('rm', [join(dir, 'docs/contracts/FIX-T-01.md')])

  put('A-T-01', { writes: ['src/a/'] })
  put('B-T-01', { writes: ['src/b/'] })
  put('C-T-01', { writes: ['src/a/lib/'] })              // overlaps A — cannot share a wave
  put('D-T-01', { writes: ['src/d/'], depends: ['A-T-01'] })  // waits on A
  put('E-T-01', { writes: ['src/e/'], status: 'completed' })
  git('add', '-A'); git('commit', '-qm', 'wave fixture')

  let r = plan('docs/contracts')
  check('fleet: exits 0 on a clean base branch', r.status === 0, r.stderr || r.stdout)
  check('fleet: independent contracts are runnable', /A-T-01/.test(r.stdout) && /B-T-01/.test(r.stdout), r.stdout)
  const held = r.stdout.split('Held back:')[1] || ''
  check('fleet: an overlapping contract is held out of the wave', /C-T-01/.test(held) && /overlap/.test(held), held)
  check('fleet: an unmet dependency is held, and says which', /D-T-01/.test(held) && /waiting on A-T-01/.test(held), held)
  check('fleet: a completed contract is not offered', !/E-T-01/.test(r.stdout.split('Held back')[0]), r.stdout)
  check('fleet: an unstated ceiling warns loudly', /ceilings is unstated/.test(r.stdout), r.stdout)

  // max_parallel caps the wave
  const prof = join(dir, '.trellis', 'profile.yml')
  writeFileSync(prof, readFileSync(prof, 'utf8') + 'concurrency:\n  max_parallel: 1\n  ceilings: "one dev server on 4200"\n')
  r = plan('docs/contracts')
  check('fleet: max_parallel caps the wave', /Runnable now: 1 of 2 eligible/.test(r.stdout), r.stdout)
  check('fleet: declared ceilings are read back', /one dev server on 4200/.test(r.stdout), r.stdout)

  // §7 — a wave must branch from one recorded base commit, so not from a feature branch
  git('checkout', '-qb', 'task/A-T-01-thing')
  r = plan('docs/contracts')
  check('fleet: refuses to launch off the base branch', r.status === 1 && /not the base branch/.test(r.stdout), r.stdout)
  git('checkout', '-q', 'main')

  // an active contract in this checkout means something is already writing this tree
  put('F-T-01', { writes: ['src/f/'], status: 'active' })
  r = plan('docs/contracts')
  check('fleet: refuses while a contract is already active', r.status === 1 && /already active/.test(r.stdout), r.stdout)
  execFileSync('rm', [join(dir, 'docs/contracts/F-T-01.md')])

  // the recorded wave, and reading it back
  r = plan('docs/contracts', '--record')
  check('fleet: --record writes the wave', r.status === 0 && existsSync(join(dir, '.trellis/wave.json')), r.stdout)
  const wave = JSON.parse(readFileSync(join(dir, '.trellis/wave.json'), 'utf8'))
  check('fleet: the wave records one base commit', /^[0-9a-f]{40}$/.test(wave.base_commit || ''), JSON.stringify(wave))
  check('fleet: the wave records its contracts', Array.isArray(wave.contracts) && wave.contracts.length === 1, JSON.stringify(wave))

  r = plan('--wave')
  check('fleet: --wave reads the recorded wave back', /Base commit/.test(r.stdout), r.stdout)
  check('fleet: nothing green yet means nothing integrates', /Nothing integrates|still in flight/.test(r.stdout), r.stdout)

  // a blocked member holds the whole wave, including the ones that passed (§7)
  const id = wave.contracts[0]
  const f = join(dir, 'docs/contracts', id + '.md')
  writeFileSync(f, readFileSync(f, 'utf8').replace(/^status: pending$/m, 'status: blocked'))
  r = plan('--wave')
  check('fleet: a blocked member holds the whole wave', r.status === 1 && /Integration of the whole wave is held/.test(r.stdout), r.stdout)
}

// ── session start: the one line of always-on cost ────────────────────────────
{
  const dir = repo({ branch: 'main' })
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-nogov-')))
  cleanup.push(bare)
  const start = (cwd, pluginRoot) => {
    const r = spawnSync('node', [join(HANDLERS, 'session-start.mjs')], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', cwd }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot ?? ROOT }
    })
    try { return JSON.parse(r.stdout || '{}') } catch { return { unparsed: r.stdout } }
  }

  let out = start(bare)
  check('session-start: silent in a repo that did not opt in', !out.additionalContext, JSON.stringify(out))

  out = start(dir)
  const ctx = out.additionalContext || ''
  check('session-start: names the repo as governed', /governs this repo/.test(ctx), ctx)
  check('session-start: says what arms enforcement', /Silent until a branch matches/.test(ctx), ctx)
  check('session-start: points at the map', /REFERENCE\.md is the map/.test(ctx), ctx)
  check('session-start: names the rendered pages', /docs\/reference\.html/.test(ctx) && /docs\/getting-started\.html/.test(ctx), ctx)

  // The cost of the only hook that spends context, asserted rather than assumed. If this fails the
  // line grew — decide deliberately whether it earned the tokens, and move the bound if it did.
  check(`session-start: stays under ~120 tokens (is ~${Math.round(ctx.length / 4)})`, ctx.length < 480, `${ctx.length} chars`)

  // A plugin root without the docs must not advertise files that are not there.
  out = start(dir, bare)
  check('session-start: never points at a page that is missing',
    !/docs\/reference\.html/.test(out.additionalContext || ''), out.additionalContext)
}

// ── decision records: superseding cannot be half-done ────────────────────────
{
  const VA = join(ROOT, 'scripts', 'validate-adr.mjs')
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-adr-')))
  cleanup.push(dir)
  const run = (...a) => spawnSync('node', [VA, ...a], { cwd: dir, encoding: 'utf8' })

  const adr = (n, o = {}) => `# ADR ${n} — A decision stated as a statement

- **Status:** ${o.status || 'accepted'}
- **Date:** 2026-08-19
- **Supersedes:** ${o.supersedes || 'none'}

## Context
The forcing constraint.

## Decision
The position, in the present tense.

## Considered and refused
${o.refused === '' ? '' : (o.refused || 'The obvious alternative — disqualified because it needs a deploy to change.')}

## Consequences
It costs a cache TTL.

**Accepted is not validated.** Owes the first incident.
`
  const put = (name, body) => writeFileSync(join(dir, name), body)

  put('0001-first.md', adr('0001'))
  let r = run('0001-first.md')
  check('adr: a record on the template shape passes', r.status === 0, r.stdout)

  // §9's point: an accepted record with no refusals keeps the outcome and loses the reasoning
  put('0002-hollow.md', adr('0002', { refused: '' }))
  r = run('0002-hollow.md')
  check('adr: accepted with no refusals is an ERROR', r.status === 1 && /Considered and refused` is empty/.test(r.stdout), r.stdout)

  // the dangerous half — two records both claiming to be current
  put('0002-hollow.md', adr('0002', { supersedes: 'ADR 0001' }))
  r = run('.', '--all')
  check('adr: superseding a record still marked accepted is an ERROR',
    r.status === 1 && /still\s+"accepted"/.test(r.stdout), r.stdout)
  check('adr: and it says why that is the dangerous half', /will be cited/.test(r.stdout), r.stdout)

  // both halves done: no complaint
  put('0001-first.md', adr('0001', { status: 'superseded' }))
  r = run('.', '--all')
  check('adr: both halves marked passes', r.status === 0 && /claimed from both sides/.test(r.stdout), r.stdout)

  // the other half — withdrawn with no successor
  put('0003-orphan.md', adr('0003', { status: 'superseded' }))
  r = run('.', '--all')
  check('adr: superseded with nothing replacing it is an ERROR',
    r.status === 1 && /no record claims to replace it/.test(r.stdout), r.stdout)

  // a supersede pointing nowhere
  put('0003-orphan.md', adr('0003', { supersedes: 'ADR 0099' }))
  r = run('.', '--all')
  check('adr: superseding a record that does not exist is an ERROR',
    r.status === 1 && /does not exist here/.test(r.stdout), r.stdout)
}

// ── publishing a page for one audience ───────────────────────────────────────
// The page is the only thing a decision-maker ever sees of this work, so the assertions are about what
// it must carry and — just as much — what it must not: a settled decision published to the reader least
// equipped to reopen it is the failure mode, not a missing heading.
{
  const PQ = join(ROOT, 'scripts', 'publish-questions.mjs')
  const dir = repo()
  const out = join(dir, 'pages')
  const run = (...a) => spawnSync('node', [PQ, ...a], { cwd: dir, encoding: 'utf8' })

  const spec = (over = {}) => `---
id: pub
title: A spec with something to ask
status: ${over.status || 'approved'}
owner: ${over.owner || 'APN Leadership'}
date: 2026-08-19
supersedes: none
contracts: []
feature_flag: none
flag_reason: >-
  fixture
e2e: none
e2e_reason: none needed
ceilings: none
---
# pub

## Why
We ship 3 of the 4 options today and \`a\` \`b\` sit next to each other.

## Outcome
One page per audience.

## Decisions
| Decision | Position |
|---|---|
| Where the flag lives | In the database |

**Considered and refused:** an external flag service, disqualified because changing them needs a deploy.

## Out of scope
- none

## Open questions
${over.questions || `### APN Leadership

**Q-01 · Does the marketplace take the booking, or pass a lead to the FBO?**

The brief asserts both.

- **If nobody answers:** the manual-confirmation shape ships and the race is found by a customer.
- **Detail:** W1 vs W3, and an \`Idempotency-Key\` on the inbound write.

### Architecture

**Q-02 · Does the read model own its own store?**

- **If nobody answers:** it shares, and the first slow query is a product incident.`}
`
  const put = (name, body) => { const f = join(dir, name); writeFileSync(f, body); return f }
  const page = () => readFileSync(join(out, 'pub--apn-leadership.html'), 'utf8')

  let r = run(put('pub.md', spec()), '--for', 'APN Leadership', '--out', out)
  check('publish-questions: renders and reports no existing page',
    r.status === 0 && /existing\s+none/.test(r.stdout), r.stdout + r.stderr)

  const html = page()
  check('publish-questions: the page carries the question and its default',
    /Does the marketplace take the booking/.test(html) && /If nobody answers/.test(html), '')
  check('publish-questions: the page names the owner and says it is generated',
    /APN Leadership/.test(html) && /generated/i.test(html) && /do not edit/i.test(html), '')
  check('publish-questions: one page carries one audience',
    !/read model own its own store/.test(html), 'the other audience leaked onto the page')

  // The refusal that makes this feature acceptable at all: a published page is a derived view of the
  // questions, never of the decisions already taken.
  check('publish-questions: no settled decision reaches the page',
    !/Considered and refused/.test(html) && !/external flag service/.test(html) &&
    !/Where the flag lives/.test(html), 'a decision leaked into the published page')

  // The placeholder collision: a bare digit in prose used to come back as "undefined".
  check('publish-questions: bare numbers in prose survive rendering',
    /We ship 3 of the 4 options/.test(html) && !/undefined/.test(html), '')
  check('publish-questions: adjacent code spans both survive',
    /<code>a<\/code> <code>b<\/code>/.test(html), '')

  // The stored URL is the whole feature.
  const URL_A = 'https://claude.ai/code/artifact/aaaa-1111'
  const URL_B = 'https://claude.ai/code/artifact/bbbb-2222'
  r = run('pub.md', '--for', 'APN Leadership', '--url')
  check('publish-questions: --url exits non-zero before anything is recorded', r.status !== 0, r.stdout)

  r = run('pub.md', '--for', 'APN Leadership', '--record', URL_A)
  check('publish-questions: --record stores the URL', r.status === 0 && r.stdout.includes(URL_A), r.stdout)

  r = run('pub.md', '--for', 'APN Leadership', '--url')
  check('publish-questions: --url returns exactly what was recorded',
    r.status === 0 && r.stdout.trim() === URL_A, r.stdout)

  r = run(join(dir, 'pub.md'), '--for', 'APN Leadership', '--out', out)
  check('publish-questions: a later render reports the existing URL so it can be updated in place',
    r.stdout.includes(URL_A), r.stdout)

  // Replacing a URL strands whoever holds the old page. It is allowed, and it is not silent.
  r = run('pub.md', '--for', 'APN Leadership', '--record', URL_B)
  check('publish-questions: replacing a recorded URL warns that the old page is stranded',
    r.status === 0 && /warning/.test(r.stdout) && r.stdout.includes(URL_A), r.stdout)

  r = run('pub.md', '--for', 'APN Leadership', '--record', 'not-a-url')
  check('publish-questions: --record refuses something that is not a URL', r.status === 2, r.stdout)

  // Addressing is exact on purpose: a page for two audiences is a page neither of them owns.
  r = run('pub.md', '--for', 'a', '--out', out)
  check('publish-questions: an audience matching more than one exits non-zero',
    r.status === 1 && /neither of them owns/.test(r.stderr), r.stderr)
  r = run('pub.md', '--for', 'Finance', '--out', out)
  check('publish-questions: an unknown audience names the ones that exist',
    r.status === 1 && /APN Leadership/.test(r.stderr), r.stderr)

  // A question with no stated default is shown as missing rather than quietly rendered as complete.
  put('nodefault.md', spec({
    questions: '### APN Leadership\n\n**Q-01 · A question nobody has priced?**\n\nContext.\n\n- **Detail:** x.'
  }))
  r = run('nodefault.md', '--for', 'APN Leadership', '--out', out)
  const nd = readFileSync(join(out, 'pub--apn-leadership.html'), 'utf8')
  check('publish-questions: a question with no default warns and the page says so',
    /warning:/.test(r.stdout) && /Not stated/.test(nd), r.stdout)

  put('noowner.md', spec({ owner: '~' }))
  r = run('noowner.md', '--for', 'APN Leadership', '--out', out)
  check('publish-questions: a spec with no owner warns, and the page says unassigned',
    /no owner/.test(r.stdout) && /unassigned/.test(readFileSync(join(out, 'pub--apn-leadership.html'), 'utf8')),
    r.stdout)

  // The page is read by somebody outside the repository, in whatever theme they use.
  check('publish-questions: the page is theme-aware and fetches nothing',
    /prefers-color-scheme/.test(html) && /data-theme="dark"/.test(html) &&
    !/https?:\/\/fonts\./.test(html) && !/<script/.test(html), '')
}

// ── landing an answer on a spec ──────────────────────────────────────────────
// The invariant under test is not "it inserts the right text" but "it cannot do anything else". A tool
// pointed at a requirement is only safe if a bug in it produces no write rather than a mangled spec —
// and this check caught exactly that on its first real use, when the insertion normalised a blank line.
{
  const AQ = join(ROOT, 'scripts', 'answer-question.mjs')
  const dir = repo()
  const run = (...a) => spawnSync('node', [AQ, ...a], { cwd: dir, encoding: 'utf8' })

  const SPEC = `---
id: land
title: A spec with two unanswered questions
status: draft
owner: A Role
date: 2026-08-19
supersedes: none
contracts: []
feature_flag: none
flag_reason: >-
  fixture
e2e: none
e2e_reason: none needed
ceilings: none
---
# land

## Why
x

## Outcome
x

## Open questions

### APN Leadership

**Q-01 · Does the marketplace take the booking?**

The brief asserts both.

- **If nobody answers:** the manual shape ships.
- **Detail:** W1 vs W3.

**Q-02 · Does the read model own its store?**

- **If nobody answers:** it shares.
`
  const spec = join(dir, 'land.md')
  const reset = () => { writeFileSync(spec, SPEC); return SPEC }

  // Draft mode writes nothing. This is the whole of Q-02's answer, mechanically.
  reset()
  let r = run(spec, '--id', 'Q-01', '--by', 'A Role', '--answer', 'It takes the booking.')
  check('answer-question: without --apply it prints and writes nothing',
    r.status === 0 && /Answered/.test(r.stdout) && readFileSync(spec, 'utf8') === SPEC, r.stdout)

  r = run(spec, '--id', 'Q-01', '--by', 'A Role', '--answer', 'It takes the booking.', '--apply')
  const landed = readFileSync(spec, 'utf8')
  check('answer-question: --apply inserts the block', r.status === 0 && /\*\*Answered .* — A Role:\*\* It takes the booking\./.test(landed), r.stdout)

  // The insert-only proof, asserted from the outside: remove the block and the file must be identical.
  const inserted = landed.match(/\n\n\*\*Answered [^\n]*/)[0]
  check('answer-question: the inserted block is the only change, byte for byte',
    landed.replace(inserted, '') === SPEC, 'the file changed in some other way as well')

  check('answer-question: the answer lands inside its own question, not at the end',
    landed.indexOf('Answered') < landed.indexOf('Q-02'), 'the block landed outside the question it answers')
  check('answer-question: it says the thread must be resolved only afterwards',
    /resolve the comment thread/.test(r.stdout) && /not before/.test(r.stdout), r.stdout)

  // A second answer is a supersede, and a person decides which one holds.
  r = run(spec, '--id', 'Q-01', '--by', 'Someone Else', '--answer', 'Actually a lead.', '--apply')
  check('answer-question: an already-answered question is refused',
    r.status === 1 && /already carries an answer/.test(r.stderr) && /supersede/.test(r.stderr), r.stderr)
  check('answer-question: the refusal left the file alone', readFileSync(spec, 'utf8') === landed, '')

  // The other question is untouched by the first answer.
  r = run(spec, '--id', 'Q-02', '--by', 'APN Leadership', '--answer', 'It owns its store.', '--apply')
  check('answer-question: a second question still lands, at the end of the file', r.status === 0, r.stdout)

  reset()
  r = run(spec, '--id', 'Q-01', '--answer', 'unsigned')
  check('answer-question: an answer with no --by is refused',
    r.status === 2 && /--by is required/.test(r.stderr), r.stderr)
  r = run(spec, '--id', 'Q-01', '--by', 'A Role', '--answer', '   ')
  check('answer-question: an empty answer is refused', r.status === 2, r.stderr)
  r = run(spec, '--id', 'Q-99', '--by', 'A Role', '--answer', 'y')
  check('answer-question: an unknown id is refused and the real ids are named',
    r.status === 1 && /Q-01/.test(r.stderr) && /Q-02/.test(r.stderr), r.stderr)
  check('answer-question: none of the refusals wrote anything', readFileSync(spec, 'utf8') === SPEC, '')
}

// ── the two rendering defects the first real page exposed ────────────────────
// Found on the page a person actually opened, not by a fixture — which is the second time real material
// has caught something four months of "finished" parsing did not.
{
  const PQ = join(ROOT, 'scripts', 'publish-questions.mjs')
  const dir = repo()
  const out = join(dir, 'pages')

  writeFileSync(join(dir, 'render.md'), `---
id: render
title: A spec whose prose wraps and counts
status: approved
owner: A Role
date: 2026-08-19
supersedes: none
contracts: []
feature_flag: none
flag_reason: >-
  fixture
e2e: none
e2e_reason: none needed
ceilings: none
---
# render

## Why
It was refused because *"two copies of one decision drift, and
nothing tells you which one the reader used."*

Two things changed:

1. The first thing that changed.
2. The second thing that changed.

## Outcome
x

## Open questions

### A Role

**Q-01 · Does it render?**

- **If nobody answers:** it does not.
`)
  const r = spawnSync('node', [PQ, 'render.md', '--for', 'A Role', '--out', out], { cwd: dir, encoding: 'utf8' })
  const html = r.status === 0 ? readFileSync(join(out, 'render--a-role.html'), 'utf8') : ''
  check('page: emphasis spanning a line break is rendered',
    /<em>"two copies of one decision drift,/.test(html) && !/\*"two copies/.test(html), r.stdout + r.stderr)
  check('page: a numbered list is a list, not a paragraph with digits in it',
    /<ol>/.test(html) && /<li>The first thing that changed\.<\/li>/.test(html), '')
}

// ── report ───────────────────────────────────────────────────────────────────

for (const d of cleanup) { try { rmSync(d, { recursive: true, force: true }) } catch {} }

if (failures.length) {
  console.log(`\n✗ ${failures.length} failed, ${pass} passed\n`)
  for (const f of failures) console.log(`    FAIL  ${f}`)
  process.exit(1)
}
console.log(`✓ ${pass} hook checks passed`)
