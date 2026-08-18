---
# ─── identity ────────────────────────────────────────────────────────────────
id: feature-flag-governance
title: Force the feature-flag question to be answered, without trying to detect it
status: approved
owner: Yainier Caraballo
date: 2026-08-18
supersedes: none

# ─── the wave ────────────────────────────────────────────────────────────────
contracts:
  - FLAGS-T-01

# ─── cross-cutting ───────────────────────────────────────────────────────────
feature_flag: none
flag_reason: >-
  This wave ships documentation and rules only. There is no runtime surface to switch off, and a
  flag over a rule file would be a rule that is sometimes true.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  Nothing executes. The equivalent proof is this spec being written with the template the wave
  delivers, and the validator still passing over the contract set.
e2e_owner: ~

ceilings: none
---

# feature-flag-governance — Force the feature-flag question to be answered, without trying to detect it

## Why

Nothing in Trellis asks whether a change needs a feature flag. The question therefore gets asked
when someone remembers, which means it gets asked inconsistently and skipped exactly on the changes
that are moving fastest — the ones where an unflagged mistake is most expensive to undo.

The tempting fix is detection: have the plugin look at a change and decide whether it needs a flag.
That fails on its own terms. Whether something needs a flag is a judgement about the domain, not a
structural property of the diff. The signals a machine can see — a public endpoint touched, a route
added — correlate weakly with the real answer, so a detector produces false positives, and
`core.md` §10 already names where that ends: a gate that is wrong gets switched off, and a gate that
is switched off protects nothing.

## Outcome

No spec can be approved without an explicit answer to "does this need a flag, and when does it die".
`none` remains a perfectly good answer; silence stops being one. The judgement stays with a human at
spec time, where it belongs, and the framework's contribution is that the question cannot be
forgotten rather than that it is answered automatically.

Two structural gaps close as a side effect: `templates/SPEC.md` exists — the README has promised it
since the first commit — and the reason cross-cutting concerns keep landing in the wrong place is
stated once as a rule instead of being rediscovered per topic.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Detect flag-worthy changes | Refused. Judgement about the domain, not structure | here |
| Require the answer instead | A mandatory field where a declared `none` is valid and silence is not | here |
| Where the question lives | The spec, never the individual contract | `rules/core.md` §12 |
| Flags are stored in the database | Locked. No external flag service | `docs/adr/0002-feature-flags-live-in-the-database.md` |
| Enforce the field in a validator now | Deferred. `schemas/` has no spec validator yet, and requiring the field on contracts would invalidate the existing set | here |

**Considered and refused:** a `PostToolUse` hook that greps a diff for endpoint or route changes and
warns "this may need a flag". Refused because its precision would be low on exactly the changes that
matter, and a noisy guardrail trains people to ignore it. Recorded because it is the obvious idea and
will be re-proposed otherwise.

## Feature flag

`feature_flag: none` — see the reason in the frontmatter.

## Cross-cutting verification

`e2e: none`. The wave delivers documents. Its proof is that this spec was written using the template
the wave produces, that the contract validator still passes over `docs/contracts --all`, and that the
hook suite is unaffected.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `FLAGS-T-01` | The spec template, ADR 0002, and rules §12 and §13 | — |

One contract, because the four deliverables are one thought and splitting them would produce four
contracts that each read half of it. `core.md` warns about over-decomposition for exactly this shape.

## Out of scope

- **The mechanism.** Table schema, read API, caching strategy, naming convention. Those are
  stack-specific and belong in a rule pack layered through `rules.packs`, never in the core plugin —
  the plugin does not know that a database exists.
- **Percentage rollouts, cohorts and targeting.** ADR 0002 records that the database choice does not
  provide these for free.
- **Mechanical enforcement of the new field.** Deferred with its reason above.
- **`templates/ADR.md`.** The README promises it and it is still missing; two ADRs have now been
  written by hand. It is a real gap and it is not this wave.

## Open questions

- Where the flag audit trail lives — who flipped what, when. ADR 0002 flags it as a consequence of
  the database choice but the answer is a rule-pack decision, and nobody has made it.
- Whether `flag_retire_by` should accept a milestone name or only a date. Left permissive until
  there is evidence that permissiveness hurts. No contract depends on this.
