---
# ─── identity ────────────────────────────────────────────────────────────────
id: SPEC-T-01                    # <spec-slug>-T-NN, zero-padded, unique repo-wide
title: Short imperative title
spec: openspec/changes/<slug>    # parent spec this contract implements; `none` only for mechanical work
status: pending                  # pending | active | blocked | gated | completed | withdrawn
ticket: ~                        # tracker id, filled by /trellis:task-start

# ─── execution ───────────────────────────────────────────────────────────────
executor: subagent               # subagent | session   (>3h or multi-layer ⇒ session)
agent: implementer               # the role that owns these write paths
model: sonnet                    # sonnet | opus | haiku
estimate: 90min

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []                   # contract ids that must be `completed` first
parallel_safe_with: []           # contract ids that may run concurrently (assertion, not proof)
reads:                           # paths this contract reads but does not modify
  - src/App/Features/Shared/
writes:                          # paths this contract may modify — the scheduling primitive
  - src/App/Features/Thing/
  - tests/unit/App.Tests/Features/Thing/

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none                      # human gates this contract is expected to reach, or `none`
---

# <id> — <title>

## Objective

One paragraph. What is true after this contract is done that is not true now. Written so that
someone who has not read the spec can tell whether the deliverable matches.

## Pre-conditions

- [ ] Every `depends_on` contract is `completed`
- [ ] Clean build baseline on the base commit
- [ ] <any human gate that must be cleared before starting>

## Constraints

Every entry is an explicit, enforceable rule citing its source. These are copied verbatim into the
executor's prompt, so they must stand alone.

- <rule the change touches, citing the rule file or decision record that governs it>
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints` or `done_when`. A wrong contract is amended by
  the human in a separate commit before code is written.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. Read the parent spec and every decision record it names.
2. <imperative step>
3. <imperative step>

## Done when

Prefer runnable commands so the orchestrator can re-execute each criterion verbatim.

- [ ] `dotnet build <solution>` exits 0
- [ ] `dotnet test <project> --filter <FullyQualifiedName~Thing>` exits 0
- [ ] `grep -rn "<marker>" src/App/Features/Thing/ | wc -l` ≥ 1
- [ ] <descriptive criterion, only where no command can express it>

## Out of scope

State this explicitly. `none` is a valid answer; an empty section is not.

- <what a reader might reasonably expect here and will not get, and why>

## Notes

Anything the executor needs that is not a step: known traps, a nearby precedent to copy, a decision
already taken in conversation.
