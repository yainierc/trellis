---
name: fleet
description: Launch several already-approved contracts at once, each as an implementer subagent in its own git worktree branched from one recorded base commit. Use when the user says "run the fleet", "start these in parallel", "launch the wave", or wants to execute more than one contract at the same time.
---

# Launch the wave

Every contract you are about to start was already agreed: its spec was approved, its plan was decided,
and a human granted its autonomy one contract at a time. **You are starting approved work, not
deciding what to work on.** That distinction is the whole licence for this skill to exist.

So: you never choose what goes in the wave beyond what is provably runnable, you never declare anything
done, and **you never merge**.

## Steps

### 1. Compute the set. Do not judge it.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fleet-plan.mjs" <contracts path>
```

Which contracts may run together is arithmetic over `writes` and the dependency graph, and a model
doing arithmetic is a model guessing. Read the output; do not recompute it.

Two contracts can each be individually runnable and still not be runnable *together* — that is why
the script chooses a set rather than filtering a list.

### 2. Refuse to launch on any of these

The script reports them under **Cannot launch**. Stop and say which one, plainly.

- **Not on the base branch.** Every worktree must branch from one recorded base commit (§7). A wave
  launched from a feature branch is not isolated, it is nested.
- **A contract already `active` in this checkout.** Finish it or block it. Two things writing the same
  tree is the failure worktrees exist to prevent.
- **Nothing runnable.** Say why — the held-back list gives the reason per contract, and "waiting on
  X" usually means the wave before this one has not finished.

### 3. Read the ceilings out loud

`concurrency.ceilings` is about the things that are not tokens: dev-server ports, licence seats, a
shared test database. The profile's own comment is the warning — *state them or the fleet will exceed
them, and the failure will look like broken code.*

If it is unstated, **say so before launching**, with the number of subagents about to start. Do not
refuse; a repository may genuinely have no shared resource. But do not let it pass in silence either —
a wave that dies on port contention wastes a whole cycle and looks like a bug in the work.

If ceilings *are* declared, check the wave against them yourself. The script cannot: it does not know
what a "seat" is.

### 4. Confirm the set with a human

Show what will start, its paths, its branch, and its worktree. Then ask.

This is the last cheap moment. After the launch there are N subagents writing in N trees, and stopping
them is more expensive than not starting them.

### 5. Record the base, then create the worktrees

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fleet-plan.mjs" <contracts path> --record
```

That fixes one base commit for the whole wave in `.trellis/wave.json`. §7 requires it be recorded, and
this is the record. Add it to `.gitignore` if it is not there: local execution state, not a shared
decision.

Then, per contract, from the worktree root the profile names:

```
git worktree add <worktree_root>/<id> -b task/<id>-<slug> <base_commit>
```

All from the **same** commit. Not from `HEAD` per worktree — `HEAD` moves, and a wave whose members
branched from different commits integrates into a tree nobody can reason about.

### 6. Dispatch one implementer per contract

One `implementer` subagent per worktree, given the contract's path and told which worktree it is in.
They run concurrently.

Each one carries an `agent_type`, which is the only condition under which the profile's per-role area
table binds — so the areas allocated in planning are enforced for the first time here.

Set each contract's `status` to `active` as it starts. That is the one field an orchestrator may write.

### 7. Report, and hand integration over

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/fleet-plan.mjs" --wave
```

Reads the recorded wave and each contract's current state. You do not need to track anything: the Stop
gate writes `blocked` into a contract when it fails, so the wave's progress lives in the contract files
rather than in a ledger that would go stale.

Then:

- **A failure isolates.** Its siblings continue — they are independent by construction. Its dependents
  do not start. **Never retry it** (§8): the decision to retry, abandon or pause is the human's, and a
  fleet makes auto-retry tempting because one failure in four reads as noise.
- **Never merge.** Not per contract as it goes green, not at the end. §7 is explicit that partial
  integration leaves a hybrid tree when a late contract fails. Report that the wave is green and stop.
- **Never remove a worktree holding uncommitted work.** Report orphans and leave them. Removing one
  destroys work that a human may still want.

## Failure modes seen in the wild

| Symptom | Cause | Fix |
|---|---|---|
| The wave integrated into a tree nobody could reason about | Worktrees branched from `HEAD` at different moments | One recorded base commit for the whole wave. Step 5 |
| Four subagents, one port, all four fail with different errors | `ceilings` unstated and unread | Step 3, out loud, every launch |
| A green contract was merged and then a sibling failed | Merged per contract | Never merge. §7 |
| A failure quietly became a retry | One in four looked like noise | §8. The decision is the human's |
| Two contracts wrote the same file | The set was filtered by hand instead of computed | The script chooses a set. Do not recompute it |
| A worktree deleted with a day's work in it | Tidying up | Report orphans; never remove one with uncommitted changes |
