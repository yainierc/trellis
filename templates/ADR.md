# ADR NNNN — <the decision, as a statement rather than a topic>

<!--
Filename: docs/adr/NNNN-slug.md — zero-padded, next integer, kebab-case slug.

The title is the decision, not its subject. "Feature flags live in the database" tells a reader what
was decided; "Feature flags" makes them read the file to find out.

The four sections below are required. They are not a standard borrowed from elsewhere — they are what
this project's records converged on independently, which is better evidence.
-->

- **Status:** proposed | accepted | superseded | refused
- **Date:** <YYYY-MM-DD>
- **Supersedes:** none          <!-- ADR NNNN this replaces. Mark that one `superseded` in the same commit -->
- **Amends:** none              <!-- a rule this narrows or extends, e.g. `rules/core.md` §4 -->

## Context

What is true that makes this decision necessary, in enough detail that somebody arriving in a year can
tell whether it is still true. Constraints, not preferences. If the context changes, that is the
signal to write the next ADR rather than to edit this one.

Name the thing that forced the choice. A decision with no forcing constraint is a preference, and
preferences do not need records.

## Decision

The position, stated plainly and in the present tense: *"Feature flag state lives in the product's own
database. There is no external flag service."*

If the decision has preconditions, list them — every one must hold, and a reader should be able to
check each. If it changes a rule, say which rule and how.

## Considered and refused

**Required, and the reason this file is worth writing.** `rules/core.md` §9:

> *A mechanism that was **considered and refused** is recorded as refused with its reason — that
> record is the only thing stopping it from being re-proposed as a fresh idea.*

One entry per alternative: what it was, and **why not**. Be specific enough that somebody who was not
in the room cannot re-propose it without answering the objection.

Distinguish the two kinds, because they age differently:

- **Refused on a trade-off** — reasonable, and it lost. Say what it would have bought and what it cost.
  A changed context can legitimately reopen it.
- **Disqualified** — it cannot work here at all. Say why it is not a trade-off. *"Changing them requires
  a deploy, and the reason to have a flag is to change behaviour without deploying."*

An ADR that records only what was chosen keeps the outcome and loses the reasoning, which is the half
that stops the argument happening again.

## Consequences

What this costs. A decision recorded without its consequences reads as free, and none of them are.

Include the ones that will surprise somebody: a latency that becomes an incident floor, an audit trail
that is no longer free, a capability the choice gives up. Where a consequence lands on another
artefact — a spec must now declare something, a runbook is now required — say so here, because that is
where a reader will look for it.

## Scope

<!-- Optional. Use it when a reader might reasonably think this decides more than it does. -->

What this record does **not** decide, and where that lives instead.

---

**Accepted is not validated.** State what evidence this decision still owes and what would confirm or
refute it — the first incident, the first month of data, the first real wave. An accepted record with
nothing outstanding is either genuinely settled or has stopped being examined, and the difference
matters.
