---
id: FLEET-T-01
title: Launch approved contracts in parallel, one worktree each, from one recorded base commit
spec: docs/specs/the-fleet.md
status: completed
ticket: ~

executor: session
agent: implementer
model: opus
estimate: 150min
autonomy: supervised

depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - scripts/parallel-matrix.mjs
  - agents/implementer.md
writes:
  - scripts/fleet-plan.mjs
  - skills/fleet/SKILL.md
  - templates/project-profile.yml
  - scripts/test-hooks.mjs
  - REFERENCE.md

gates: none
---

# FLEET-T-01 — Launch approved contracts in parallel, one worktree each, from one recorded base commit

## Objective

`node scripts/fleet-plan.mjs` answers what may run right now: `pending` contracts whose dependencies
are all `completed`, mutually parallel-safe by derived `writes` disjointness, capped at
`concurrency.max_parallel`, with the repository's stated ceilings surfaced. `/trellis:fleet` confirms
that set with a human, records one base commit, creates a worktree per contract, and dispatches an
`implementer` subagent into each. Nothing merges — the wave reports green and integration stays a
human act, because §7 says partial integration leaves a hybrid state.

## Pre-conditions

- [x] Verified: `concurrency.max_parallel`, `concurrency.ceilings` and `git.worktree_root` are read by
      no code, while the profile's own comment describes a fleet exceeding them
- [x] `parallel-matrix.mjs` already derives which contracts may run together
- [x] `agents/implementer.md` exists and cannot self-certify

## Constraints

- **It is a launcher, not an orchestrator.** It starts work whose spec was approved, whose plan was
  agreed and whose autonomy was granted per contract. It never chooses what to work on, never declares
  anything done, and never integrates.
- **One base commit for the whole wave, recorded** (§7). `.trellis/wave.json`, gitignored — local
  execution state, and "recorded" means verifiable rather than committed.
- **Never merge.** Not per contract, not at the end. A green wave is reported; a human integrates.
- **A failure isolates.** Siblings continue, because they are independent by construction. Dependents
  do not start. **And the wave's integration is blocked** even for the contracts that succeeded.
- **Never retry** a failed contract. §8, and a fleet makes it tempting because one failure in four
  reads as noise.
- The runnable set is **computed**, never inferred by a model. It is arithmetic over `writes` and the
  dependency graph.
- **Never remove a worktree with uncommitted work.** Report orphans; refuse to tidy them.
- Refuse to launch from anywhere but the base branch, and refuse while a contract is already in flight
  in this checkout.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `scripts/fleet-plan.mjs` — the runnable set, the ceiling report, `max_parallel`, and the wave
   record read/write. Read-only unless `--record` is given.
2. `skills/fleet/SKILL.md` — pre-flight refusals, confirm the set, record the base, create worktrees,
   dispatch implementers, report, and hand integration over.
3. `templates/project-profile.yml` — the three fields stop being decoration; their comments describe
   what now reads them.
4. `scripts/test-hooks.mjs` — the runnable set, dependency gating, the parallel-safety filter,
   `max_parallel` capping, the unstated-ceiling warning, and the wave record round-trip.
5. `REFERENCE.md` — the fleet, and move the three fields out of the not-wired-up table.

## Done when

- [ ] `node scripts/fleet-plan.mjs docs/contracts` exits 0
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "fleet" scripts/test-hooks.mjs` ≥ 5
- [ ] `grep -q "max_parallel" scripts/fleet-plan.mjs`
- [ ] `grep -q "wave.json" scripts/fleet-plan.mjs`
- [ ] `grep -q "never merge\|Never merge" skills/fleet/SKILL.md`
- [ ] `claude plugin details trellis@skills-dir 2>&1 | grep -q "Skills (5)"`
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `claude plugin validate .` passes

## Out of scope

- Integration, retry, and deciding what to work on next. All three refused in the spec.
- Removing a worktree that still holds uncommitted work.
- Making `ceilings` a required answer. That is `Q-01` in the spec and implementing it would answer it.

## Notes

The state needs no tracking: the Stop gate writes `blocked` into a contract, so the wave's progress is
readable from the contract files themselves. A launcher that kept its own ledger would have two sources
of truth about the same thing, and the one in `.trellis/` would be the one that went stale.
