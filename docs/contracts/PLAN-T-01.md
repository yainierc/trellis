---
id: PLAN-T-01
title: Derive parallelism, enforce a person's areas, and split a spec into contracts
spec: docs/specs/work-allocated-by-person.md
status: completed
ticket: ~

executor: session
agent: implementer
model: opus
estimate: 120min
autonomy: supervised

depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - scripts/validate-contract.mjs
writes:
  - scripts/parallel-matrix.mjs
  - hooks/handlers/write-boundary.mjs
  - skills/plan/SKILL.md
  - templates/project-profile.yml
  - scripts/test-hooks.mjs

gates: none
---

# PLAN-T-01 — Derive parallelism, enforce a person's areas, and split a spec into contracts

## Objective

`parallel_safe_with` is computed from `writes` and the transitive dependency graph, so the field the
validator checks is one a script produced rather than one an author guessed. The write boundary reads
the profile's `agents:` table and enforces it, which turns "Iver's areas" from a note into a boundary.
And `/trellis:plan` slices a spec into the set of contracts several people work through in parallel,
refusing to clobber a split that already exists.

## Pre-conditions

- [x] Verified: `hooks/handlers/write-boundary.mjs` does not read `profile.agents` — the table the
      profile claims is enforced is dead configuration
- [x] Verified: nothing in the plugin decomposes a spec into more than one contract

## Constraints

- **The matrix is derived, never asserted.** `core.md` §1 already says a declared overlap beats an
  author's claim; this removes the claim. Two contracts are parallel-safe only when their `writes` are
  disjoint **and** neither is a transitive ancestor of the other — direct edges are not enough.
- **The agent table binds only when an `agent_type` is present.** The main session reports none, and a
  rule that blocked it would make the whole table unusable on the day it is first filled in.
- An **empty** list for an agent means no additional restriction. `implementer: []` is the template's
  default and must not deny everything.
- An agent type that **is** present and is **not** in the table writes nothing, exactly as the profile
  has always claimed.
- `/trellis:plan` **refuses to re-split** a spec that already has contracts. Never overwrite a
  decomposition somebody may have edited by hand.
- The skill does not assign people. Who works on what is decided in a planning meeting.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `scripts/parallel-matrix.mjs` — compute the matrix, print it, and write it back under `--write`.
2. `hooks/handlers/write-boundary.mjs` — consult `profile.agents` when the event carries an agent type.
3. `templates/project-profile.yml` — correct the comment so it describes what the hook now does.
4. `skills/plan/SKILL.md` — slice, allocate by the areas a human names, derive, validate, report gaps.
5. `scripts/test-hooks.mjs` — the derived matrix agrees with the validator; the agent table denies
   outside its areas and leaves a session with no agent type alone.

## Done when

- [ ] `node scripts/parallel-matrix.mjs docs/contracts` exits 0
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "agent_type\|parallel-matrix" scripts/test-hooks.mjs` ≥ 3
- [ ] `grep -q "profile.agents\|agents\[" hooks/handlers/write-boundary.mjs`
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `claude plugin details trellis@skills-dir 2>&1 | grep -q "Skills (4)"`
- [ ] `claude plugin validate .` passes

## Out of scope

- Assigning people to areas, estimating, and scheduling. All three stated in the spec.
- Binding a human to an area. Q-01 in the spec is open and implementing it would answer it.
- The analyst that writes the spec. Still `agents/`, still next.

## Notes

The transitive check is the part worth getting right. Two contracts with disjoint writes where one
depends on a third that depends on the other are **not** parallel-safe, and a matrix that only looks
at direct edges will happily say they are.
