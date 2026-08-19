---
# ─── identity ────────────────────────────────────────────────────────────────
id: <slug>                     # kebab-case, unique; contracts reference it as <slug>-T-NN
title: Short imperative title
status: draft                  # draft | approved | superseded
# Who answers the open questions below. REQUIRED before this spec leaves `draft` — a spec with no
# owner is a set of questions with no address, and they go unanswered until somebody assumes instead.
# A role ("APN Leadership", "Platform architect") is a valid answer when no individual has been named.
# `~` is not. Do not promote a candidate found in some other document into an owner.
owner: <name or role>
date: <YYYY-MM-DD>
supersedes: none               # spec id this replaces, or `none`

# ─── the wave ────────────────────────────────────────────────────────────────
# Every contract that implements this spec. Together they are one wave: integration happens only
# after all of them are green (rules/core.md §7).
contracts: []

# ─── cross-cutting: decided HERE, never per contract ─────────────────────────
# A contract cannot answer any of these alone, so a contract is the wrong place to ask.
# See rules/core.md §12. Frontmatter is flat on purpose — the same reader parses contracts.
#
# `none` is a valid answer everywhere below. A missing answer is not: silence does not distinguish
# "not applicable" from "nobody thought about it" (rules/README.md, cross-cutting §2).

feature_flag: none             # the flag this capability ships behind, or `none`
flag_reason: ~                 # REQUIRED either way — why it needs one, or why it does not
flag_default: ~                # the state it ships in: off | on   (`~` when flag is none)
flag_retire_by: ~              # a date or a named milestone. A flag with no end is permanent code
flag_retired_by: ~             # the contract id that deletes the flag and its branches (§13)

e2e: none                      # the cross-cutting check that proves the whole wave, or `none`
e2e_reason: ~                  # REQUIRED either way
e2e_owner: ~                   # the contract id that owns the e2e paths, so `writes` cannot collide

ceilings: none                 # environment limits this wave will hit, or `none`
                               # ports, licence seats, CORS allow-lists, shared test databases.
                               # An unstated ceiling fails in a way that looks like broken code.
---

# <id> — <title>

## Why

The problem, in terms a reader outside the team can check. What is broken, slow, missing or risky
today, and what it costs. Not the solution.

## Outcome

What is true when the whole wave has landed that is not true now. Written so that someone who has
not read the contracts can tell whether the result matches.

## Decisions

Every decision this spec depends on, each either resolved here or pointing at its ADR. A decision
recorded in an ADR is a fact and is not relitigated (rules/core.md §9).

| Decision | Position | Where |
|---|---|---|
| <what was decided> | <the position taken> | here · `docs/adr/NNNN-…` |
| <a decision that is needed and not made> | *open* | **ADR needed — not written** |

**Considered and refused:** <mechanism> — <why>. Recorded because that record is the only thing
stopping it from being re-proposed later as a fresh idea.

## Feature flag

Skip this section only when `feature_flag: none`, and then the frontmatter still carries the reason.

- **Name and read path:** how code asks whether it is on.
- **Default state:** what it ships as, and who may change it. Flipping a flag in production is a
  human gate — functionally it is a deploy (rules/core.md §4).
- **Kill path and its latency:** how it gets turned off in an incident, and how long that actually
  takes end to end. If a cache sits in front of the flag, its TTL *is* your rollback time.
- **Retirement:** the date or milestone, and the contract that removes the flag and both branches.
  A flag whose removal is not scheduled is not a flag, it is a permanent conditional (§13).

## Cross-cutting verification

The check that proves the wave delivers the flow — not the per-contract criteria, which live in each
contract's `## Done when`. It runs in `gates.pre_pr`, never in `gates.stop`: it costs minutes, and a
gate that expensive gets switched off (`docs/adr/0001-e2e-belongs-to-the-wave.md`).

State how flag state is seeded before it runs. A conditional flow cannot be verified without
controlling the condition.

## The wave

The contracts, in dependency order, and what each delivers. Filled in as they are written; the
`contracts` frontmatter list is the machine-readable copy.

| Contract | Delivers | Depends on |
|---|---|---|
| `<id>-T-01` | | — |

## Out of scope

Explicit. `none` is a valid answer; an empty section is not. Name what a reader would reasonably
expect here and will not get, and why.

## Open questions

**Grouped by who answers, not by order of discovery.** The person who has to decide should find their
own section and read six questions, not scroll through twenty-three looking for theirs.

Every question carries four things. The plain sentence is not a summary of the technical framing — it
states the decision and its cost in the decision-maker's own terms, and the technical framing stays
beside it for whoever implements.

### <who answers — a name, or a role>

**<id> · <the decision, as one plain sentence anyone can answer>**

Two or three sentences of context. No jargon, no internal identifiers, no acronyms the reader has not
already used themselves.

- **If nobody answers:** what ships in the silence, and why that is itself a decision. This is the
  line that makes an unanswered question expensive instead of merely open — the default is usually
  the option nobody would have chosen deliberately.
- **Detail:** the technical framing, the constraint it collides with, the source it came from.

A spec may be approved with open questions, as long as no contract depends on one. A contract blocked
on an open question should not have been written yet.
