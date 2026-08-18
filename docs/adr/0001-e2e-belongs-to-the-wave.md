# ADR 0001 — End-to-end verification belongs to the wave, not to the contract

- **Status:** accepted
- **Date:** 2026-08-18
- **Supersedes:** none

## Context

The contract is the only unit in Trellis that carries gates. `gates.stop` runs when an executor
tries to close, and `gates.pre_pr` runs before a pull request — both are scoped to one contract.

End-to-end tests do not fit that shape. An E2E test is cross-cutting by definition: it exercises a
flow through the frontend, the backend and often real infrastructure. The work that delivers such a
flow is normally split across several contracts precisely because `writes` keeps them from
colliding — one owns the API, another owns the screen.

So an E2E criterion written into either contract's `done_when` has only two possible outcomes:

1. it fails for as long as the other half of the flow is missing, which under §8 marks a perfectly
   healthy contract `blocked` and stops its dependents; or
2. somebody relaxes it until it passes — which is the governance defect §2 exists to prevent.

`core.md` §7 already states that *integration happens only after the whole wave is green*. The
concept of a wave exists in the rules; what does not exist is any mechanism that gates one.

## Decision

**An E2E or otherwise cross-cutting criterion is never written into an individual contract's
`done_when`, unless that contract delivers the entire flow by itself.**

Slow, integrated verification stays where the profile already puts it — `gates.pre_pr` with
`test_slow` — and its natural home, once the mechanism exists, is a wave-level gate that runs when
every contract of a spec has reached `completed`.

Two consequences follow and are part of this decision:

- **E2E paths need an owner.** `tests/e2e/` is the textbook under-declared shared path: several
  contracts want it, declare each other `parallel_safe_with`, and collide at integration. Either one
  contract owns `tests/e2e/<feature>/` outright, or the E2E work is its own contract in the wave.
- **`concurrency.ceilings` stops being optional** in any repository with E2E. Four parallel
  worktrees cannot each hold port 4200 or a licence seat. An unstated ceiling produces a failure
  that looks exactly like broken code, and gets debugged as if it were.

## Considered and refused

**Adding a `gates.wave` to the profile now.** Refused for the moment, not on merit — the mechanism is
the right one. A wave gate has to know what a wave *is*, and a wave is what the analyst produces when
it decomposes a spec into contracts. That agent does not exist yet, so the gate would be built
against a guess about its output. This is deferred until `agents/` lands, and this paragraph is the
record that it was considered rather than overlooked.

**Putting E2E in `gates.stop`.** Refused permanently. It costs minutes and fires on every attempt to
close a session; a gate that expensive gets switched off, and a gate that is switched off protects
nothing.

## Consequences

The rule above is stated in `core.md` §1 today, at tier 7 of the enforcement ladder — the model has
to read it and remember it. That is a known weakness and the correct next move is to lower it: the
contract validator can detect an E2E-shaped command in a `done_when` and warn, which would put it at
tier 3. Recorded here so the debt is visible rather than forgotten.

**Accepted is not validated.** This decision owes evidence: the first spec that actually spans a
frontend and a backend contract is what will confirm the wave is the right unit.
