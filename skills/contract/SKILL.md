---
name: contract
description: Start a piece of work under a Trellis contract — write the contract file, validate it, and branch so the guardrails arm. Use when the user says "start a contract", "new trellis task", "let's work on X under contract", "write a contract for this", or asks to begin implementing something in a repo that has .trellis/profile.yml.
---

# Start work under a contract

A contract is the unit of work. It declares what may be written, what it depends on, and how a
machine can tell it is done. Writing it is not paperwork before the work — **it is the part of the
work that decides whether the result can be checked at all.**

If `.trellis/profile.yml` does not exist, this repository has not adopted Trellis. Run
`/trellis:init` first.

## Steps

### 1. Establish what the work actually is

Read enough of the repository to write a contract that stands on its own. If the user's request is
one sentence, that is not yet a contract — ask what "done" means before writing anything.

If the change spans a frontend and a backend, or otherwise needs more than one set of write paths,
**it is more than one contract**, and the cross-cutting parts belong to a spec. See `rules/core.md`
§12. Do not fold two layers into one contract to avoid writing a spec.

### 2. Copy the template and fill it

`${CLAUDE_PLUGIN_ROOT}/templates/CONTRACT.md` → the repo's contracts path from the profile.

Get these right; the rest is prose:

- **`id`** — `<spec-slug>-T-NN`, or `<PROJECT>-T-NN` for standalone work. Unique repo-wide.
- **`writes`** — the paths this contract may modify, and nothing else. This is the field that matters
  most:
  - It is the **scheduling primitive**: two contracts collide when their `writes` overlap.
  - Narrow it to files or feature directories. A bare `docs/` or `tests/` conflicts with everything
    beneath it and serialises the whole backlog on phantom conflicts.
  - It is also the **write boundary a hook enforces**. Anything you forget here will be denied
    mid-flight, and widening scope while executing is forbidden — so think about it now.
- **`reads`** — what it needs to look at but must not change.
- **`executor`** — `subagent` for short focused work, `session` above roughly three hours or when the
  change crosses layers.
- **`done_when`** — **runnable commands wherever a command can express it.** The orchestrator and the
  Stop gate re-execute these verbatim; anything that cannot be run is reported `NOT VERIFIED` and
  counts as a failure, never a pass.
  - Do not write a criterion this contract cannot satisfy alone. An end-to-end check that needs
    another contract's half of the flow belongs to the spec (§12).
- **`## Out of scope`** — name what a reader would reasonably expect and will not get. `none` is a
  valid answer; empty is not.

### 3. Validate before branching

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-contract.mjs" <contracts path> --all
```

`--all` adds the checks that matter across contracts: dependency cycles, references to contracts that
do not exist, and `writes` overlaps between two that declare each other parallel-safe — where the
detected overlap always wins over the author's assertion.

Warnings are worth reading rather than clearing. A bare-directory `writes` warning is either a real
defect or a deliberate choice, and if it is deliberate, say so in the contract.

### 4. Ask how far this contract may carry itself — before the branch

**Ask the human, every time, and do not answer it yourself.** This is the last moment it is cheap:
the contract is written and validated, so they can see `writes` and `done_when` before deciding, and
no code exists yet.

Put both options with their consequences, in these terms:

- **Supervised** *(the default — choose it when unsure)*. You commit in the worktree and stop. They
  push, open the pull request and merge. Nothing leaves the machine without them.
- **Autonomous.** You may push the task branch, open a pull request and request auto-merge. You still
  never merge: `gh pr merge --auto` asks GitHub to merge **if its required status checks pass**, so
  the decision belongs to CI, not to you.

Record the answer in the contract's `autonomy` field — `supervised` or `autonomous` — and treat it as
part of the immutable set from then on. That field is the whole mechanism: the hook reads it, and
because the contract cannot be edited during execution, **you cannot grant yourself autonomy later.**

If they choose autonomous, say plainly which preconditions still have to hold, because the hook will
refuse without them and it is better heard now than at the push:

- the repo profile must declare `project.autonomy: auto-merge`,
- `git.deploy_on_merge` must be answered `false` — if a merge deploys to production, auto-merge is
  auto-deploy and autonomy does not apply,
- the base branch must have protection with **at least one required status check**. Without that,
  auto-merge merges immediately: it waits for required checks, and a branch with none has nothing to
  wait for.

Never propose autonomous for a schema migration, a change to a shared interface, anything that
weakens a security or isolation control, or a feature-flag flip. Those stay human under §4 whatever
the profile says.

### 5. Branch, which is what arms the guardrails

Build the branch name from the profile's `branch_pattern` and the contract id:

```
git checkout -b task/<id>-<short-slug>
```

**This is the step that turns enforcement on.** Until the branch matches, the write boundary, the git
boundary and the Stop gate are all inert. Tell the user the branch name and that the guardrails are
now armed.

**If this repository has no git**, there is no branch to read, and the explicit substitute is a
one-line file:

```
echo "<id>" > .trellis/active
```

The hooks read it exactly as they would a branch name — the write boundary and the Stop gate work
identically without a repository. Delete it when the contract is done, or the boundary keeps
enforcing a contract nobody is working on. Note that `autonomy: autonomous` is unreachable in this
case by construction: there is no remote, so there is no platform that could refuse a merge.

### 6. Set `status: active` and work

Change `status` from `pending` to `active` in the contract. That single field is the only part of the
contract an orchestrator may write.

From here on, three things are enforced mechanically and you should expect them:

- Writing outside `writes` is denied — a real problem found outside scope becomes a follow-up note
  and one line in the report, never a widened scope.
- Editing this contract is denied. If the contract is wrong, **stop and say so**: it is amended by a
  human, in a separate commit, before more code is written.
- Merging by hand, rebasing, switching branches, force-pushing and pushing to the base branch are
  denied. On a `supervised` contract so are pushing and opening a PR — you commit in the worktree and
  stop there. On an `autonomous` one those two are allowed, and if the push is refused the message
  names the precondition that failed.

### 7. Let the gate close it

Do not self-certify. When the work is done, the Stop gate re-runs every criterion itself and either
confirms it or marks the contract `blocked` and tells the human what failed. Report faithfully in the
meantime: what you ran, what you skipped, and what you did instead.

## When the working set gets noisy

Finished contracts do not leave on their own. When `docs/contracts/` has more history than live work,
run `node "${CLAUDE_PLUGIN_ROOT}/scripts/archive.mjs" --dry-run` first, read what it would move, then
run it without the flag.

It moves `completed` and `withdrawn` contracts into `archive/<year>/`, and a spec once every contract
of its wave has gone. **Statuses are never changed** — archiving is a location, not an outcome — and
`depends_on` still resolves across the boundary, so a live contract may depend on one archived long
ago. `core.md` §10 names the decay this prevents: files that only ever grow raise the context cost of
every session in the repo.

## Failure modes seen in the wild

| Symptom | Cause | Fix |
|---|---|---|
| Denied mid-flight for a file the work obviously needs | `writes` was written before the change was understood | Read first, then declare. Widening mid-flight is not available |
| A whole backlog runs one contract at a time | `writes` names a bare directory | Narrow to files or feature folders |
| The gate reports `NOT VERIFIED` and blocks | A `done_when` criterion has no runnable command | Write commands, not intentions |
| Guardrails silent through the whole task | Never branched, or the branch does not match `branch_pattern` | Step 5 is not optional |
| Contract quietly edited to make a criterion pass | Executor amended its own rubric | Categorical defect. Revert and raise it |
| Push refused on an autonomous contract | A precondition does not hold — usually no branch protection | Read the refusal; it names the one that failed |
| Autonomy chosen for a migration or a shared interface | The question was asked without the exclusions | Step 4 lists them; they are not negotiable |
