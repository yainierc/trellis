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
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs'
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

const contract = (id, criteria) => `---
id: ${id}
title: Fixture
spec: none
status: active
executor: subagent
agent: implementer
model: sonnet
estimate: 60min
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

function makeRepo ({ branch = 'task/FIX-T-01-thing', criteria = '- [ ] `true`' } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'trellis-fixture-')))
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.com')
  git('config', 'user.name', 'fixture')

  mkdirSync(join(dir, '.trellis'), { recursive: true })
  writeFileSync(join(dir, '.trellis', 'profile.yml'), PROFILE)
  mkdirSync(join(dir, 'docs', 'contracts'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'contracts', 'FIX-T-01.md'), contract('FIX-T-01', criteria))
  mkdirSync(join(dir, 'src', 'allowed'), { recursive: true })
  writeFileSync(join(dir, 'README.md'), 'fixture\n')

  git('add', '-A')
  git('commit', '-qm', 'fixture')
  if (branch !== 'main') git('checkout', '-qb', branch)
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

// ── report ───────────────────────────────────────────────────────────────────

for (const d of cleanup) { try { rmSync(d, { recursive: true, force: true }) } catch {} }

if (failures.length) {
  console.log(`\n✗ ${failures.length} failed, ${pass} passed\n`)
  for (const f of failures) console.log(`    FAIL  ${f}`)
  process.exit(1)
}
console.log(`✓ ${pass} hook checks passed`)
