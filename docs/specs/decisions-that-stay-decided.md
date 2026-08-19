---
id: decisions-that-stay-decided
title: A shape for a decision record, and a check that a superseded one says so
status: approved
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - ADR-T-01

feature_flag: none
flag_reason: >-
  A template and a validator. Nothing runs in production and there is no behaviour to switch off.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The property worth proving is that superseding cannot be half-done, and that is a two-file
  invariant a fixture can assert directly.
e2e_owner: ~

ceilings: none
---

# decisions-that-stay-decided — A shape for a decision record, and a check that a superseded one says so

## Why

`templates/ADR.md` has been promised in the README's own layout since the first commit and does not
exist. Three decision records have been written without it, each inventing its own shape — and they
converged anyway, on `Context · Decision · Considered and refused · Consequences`, which is the
strongest evidence available that this is the right spine.

All three reference projects that have skills built one for this: `decision-record-template`,
`adr-authoring`, `write-adr`. Three out of three is the clearest convergence found anywhere in them.

And `core.md` §9 has a hole. It says *"a decision recorded in an ADR is not relitigated without a new
ADR"* — and nothing anywhere says how to write that new one, or that the old one must be marked. A
supersede is a **two-file** operation: the new record names what it replaces, and the replaced one
stops presenting itself as current. Half of that is the failure: an accepted ADR that was quietly
overtaken is worse than no record, because it will be cited.

## Outcome

A decision record has a shape to fill in, and superseding cannot be half-done: `validate-adr.mjs`
refuses a record that supersedes one still marked `accepted`, and refuses one marked `superseded` that
nobody claims to have replaced. Both directions, because either half alone leaves a lie on disk.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Template plus validator, **no skill** | The discipline goes at tier 3, not tier 6. See the refusal below | here |
| The required spine | `Context` · `Decision` · `Considered and refused` · `Consequences`. Derived from what three hand-written records converged on rather than from a standard | here |
| `Considered and refused` is mandatory on an accepted record | §9's whole point: *"that record is the only thing stopping it from being re-proposed as a fresh idea"*. An ADR without it records an outcome and loses the reasoning | here |
| ADRs are never archived | §9 already has the mechanism: superseded, not filed away. `archive.mjs` deliberately does not touch them | `docs/specs/lifecycle-archive.md` |

**Considered and refused — an `adr` skill**, despite three of three reference projects building one.
Their discipline had to live in prose because a validator was not available to them; ours is. A skill
costs about a hundred tokens in every session forever and would restate what the template already
carries, while the one part that genuinely gets forgotten — marking the superseded record — is
mechanical and belongs in a check that cannot be skipped. If evidence later shows records being written
without the template, that is the moment for a skill, not now.

**Considered and refused — inventing a numbering scheme.** `NNNN-slug.md`, zero-padded, next integer.
It is what the three existing records already do and it needs no rule.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`. The supersede invariant is asserted in both directions by fixture tests.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `ADR-T-01` | `templates/ADR.md`, `scripts/validate-adr.mjs`, and the three existing records brought to the shape | — |

## Out of scope

- A skill. Refused above with its reason.
- Archiving decision records. §9 supersedes; it does not file away.
- Judging whether a decision is *good*. The validator checks that the reasoning is present, never that
  it is sound — that is what the human gate and the passage of time are for.

## Open questions

### Yainier Caraballo

**Q-01 · Should an ADR require a named accepter, the way a spec now requires an owner?**

A spec cannot be approved without an `owner`. An ADR can be `accepted` by nobody in particular.

- **If nobody answers:** records stay unattributed. Six months on, "who decided this" has no answer,
  which is half of what a decision record exists to provide.
- **Detail:** it would be one required frontmatter field and one line in the validator — the same
  change that worked for specs.
