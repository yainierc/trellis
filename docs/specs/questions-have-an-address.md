---
id: questions-have-an-address
title: A spec's open questions are sorted by who answers them, and written so they can
status: approved
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - ASK-T-01

feature_flag: none
flag_reason: >-
  A template shape, a validator and a small extraction script. Nothing runs in production.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The proof is running the new validator against three real specs written by an earlier session from
  real executive material, and seeing it name the defect those specs already flag about themselves.
e2e_owner: ~

ceilings: none
---

# questions-have-an-address — A spec's open questions are sorted by who answers them, and written so they can

## Why

Three specs written from real material by an earlier session, in another repository, came out with
`owner: ~` in all three — and each one raised its own missing owner as assumption **A-04**. The
analysis was good. It had nowhere to go.

The questions themselves show the second half of the problem. Some are already answerable by a
non-technical decision-maker:

> *"Instant-confirm against a human-maintained ledger is a product decision, not a technical one."*

Others carry the same kind of decision inside a technical frame:

> *"W1 — an inbound write with app-only auth, `(client_id, tenant_id)`, `Idempotency-Key` and
> `If-Match`, and Property's first Class-B surface"*

The person who must choose between W1 and W3 does not know what an idempotency key is, and does not
need to. Underneath, the question is one sentence: *does the marketplace take the booking and the
money, or does it pass a lead to the FBO?* Those are different products and the brief asserts both.

And the sharpest observation in that material is why this matters at all:

> *"Left open, **W2 ships by default** — the slot is sold before it is blocked, and the race is
> discovered by a customer."*

**Not answering is a decision, and its default is usually the bad one.** A spec that lists questions
without saying what ships in their absence has not finished the job.

## Outcome

A spec cannot leave `draft` without a named owner, and that is checked by a validator rather than
remembered. Open questions are grouped by **who answers them**, each written as one plain sentence a
non-technical decision-maker can act on, each stating **what ships if nobody answers**, with the
technical framing kept alongside for whoever implements.

`scripts/questions.mjs` prints one audience's questions on their own, so a list can be sent to
somebody who will never open the repository.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Two documents, one business one technical | **Refused.** They diverge, and the divergence is invisible until someone acts on the stale one. One spec, sorted | here |
| Where `owner` is enforced | A spec validator — tier 3. `schemas/` has been empty since the first commit and this is what it was reserved for | here |
| What a question must carry | The plain sentence, the audience, **the default if unanswered**, and the technical detail. The default column is the one that makes silence expensive | here |
| Roles or people as owner | Either. A role is honest when no individual has been named — but `~` is not | here |

**Considered and refused:** generating a separate business-facing document per audience. Refused for
the same reason a fork is refused everywhere else in this plugin: two copies of one decision drift,
and nothing tells you which one the reader used.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`. The real check is the new validator run against the three APN specs, read-only.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `ASK-T-01` | The question shape, the spec validator, the extraction script and the skill change | — |

## Out of scope

- Sending anything anywhere. The script prints; a human pastes. No mail, no Slack, no tracker.
- Translating an answer back into the spec. The owner answers, a human edits. Automating that would
  let a spec change under a running contract, which §2 exists to prevent.
- Any change to how contracts work. This is entirely above the contract line.

## Open questions

### Yainier Caraballo

**Q-01 · Should a spec with unanswered questions be allowed to have contracts written against it?**

Today nothing stops it. A spec can sit at `draft` with six open questions while somebody starts
implementing the parts that seem settled.

- **If nobody answers:** contracts get written against a moving target, and the framework's own §2 —
  the contract is immutable during execution — protects a contract whose parent spec is not.
- **Detail:** the check would live in the spec validator and in `/trellis:contract`'s pre-conditions.
