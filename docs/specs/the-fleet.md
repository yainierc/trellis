---
id: the-fleet
title: Run the contracts that are already approved, in parallel, in isolation
status: approved
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - FLEET-T-01

feature_flag: none
flag_reason: >-
  A script, a skill and three profile fields that already existed. Nothing runs in production.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The launch itself needs a live session with subagents, which a fixture cannot be. What is testable
  is every decision before the launch — the runnable set, the ceiling refusal, the wave record — and
  those are where the failures live.
e2e_owner: ~

ceilings: none
---

# the-fleet — Run the contracts that are already approved, in parallel, in isolation

## Why

`core.md` §7 is the most detailed rule in the framework and nothing implements it:

> *Parallel work runs one worktree per contract, every worktree branched from the **same** base commit,
> recorded. Integration happens only after the whole wave is green — partial integration leaves the
> tree in a hybrid state when a late contract fails.*

Three profile fields exist to serve it and are read by nothing: `concurrency.max_parallel`,
`concurrency.ceilings`, `git.worktree_root`. The `ceilings` comment says *"state them or **the fleet**
will exceed them"* — the profile describes a fleet that has never existed.

And the whole reason `writes` is the scheduling primitive is to know what may run at once.
`parallel-matrix.mjs` already derives it. Nothing consumes the answer.

**This was refused once, for the wrong reason.** The refusal conflated an *orchestrator* — something
that decides what to work on and when it is done — with a *launcher*, which starts contracts whose
spec was approved, whose plan was agreed, and whose autonomy was granted one at a time by a human.
Every gate happens before the launch. Launching concurrently skips none of them.

## Outcome

`/trellis:fleet` takes the contracts that are runnable right now — `pending`, every dependency
`completed`, mutually parallel-safe — checks them against the repository's stated ceilings, confirms
the set with a human, and starts each as an `implementer` subagent in its own worktree branched from
one recorded base commit.

Nothing merges. The wave completes, and integration is a human act.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Launcher, not orchestrator | It starts approved work. It never decides what to work on, never declares anything done, never integrates | here |
| Where the base commit is recorded | `.trellis/wave.json`, gitignored. It is local execution state, not a shared decision — but §7 requires it be recorded, and "recorded" means verifiable, not committed | here |
| A failure in the wave | Isolates. Siblings continue — they are independent by construction. Dependents do not start. **And the whole wave's integration is blocked**, because partial integration is what §7 forbids | here |
| An unstated ceiling | A warning, loudly, every launch. Not a refusal: a repo that genuinely has no shared resource should not be blocked from ever using a fleet | here |
| Who computes the runnable set | A script. Which contracts may run together is arithmetic over `writes` and the dependency graph, and a model doing arithmetic is a model guessing | here |

**Considered and refused:** merging each contract as it goes green. Refused — §7 is explicit that
partial integration leaves a hybrid state when a late contract fails, and the failure mode is a tree
nobody can reason about at the worst possible moment.

**Considered and refused:** retrying a failed contract automatically. §8 already forbids it, and a
fleet makes it tempting because one failure among four looks like noise. It is not.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`, with its reason in the frontmatter. Every pre-launch decision is fixture-tested.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `FLEET-T-01` | `scripts/fleet-plan.mjs`, `skills/fleet`, the three profile fields made real | — |

## Out of scope

- **Integration.** The fleet reports a green wave; a human merges it. Anything else contradicts §7.
- **Retry, reschedule, or any decision about what to work on next.** Launcher, not orchestrator.
- **Cleaning up a worktree whose contract is still in flight.** Removing a worktree with uncommitted
  work destroys it, so the fleet reports orphans and refuses to tidy them.

## Open questions

### Yainier Caraballo

**Q-01 · Should the fleet refuse to launch when `ceilings: none` in a repository that plainly has a dev server?**

Today it warns. A repository with a web app almost certainly has a port constraint, and `none` there is
more likely to be an unanswered question than a true absence.

- **If nobody answers:** it warns and launches. Four subagents contend for one port, and the failure
  looks like broken code rather than like contention — which is exactly what the profile's own comment
  warns about.
- **Detail:** detecting "plainly has a dev server" is the same kind of inference this plugin refuses
  elsewhere, so the honest fix is probably to make `ceilings` a required answer rather than to guess.
