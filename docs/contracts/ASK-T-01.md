---
id: ASK-T-01
title: Give a spec's questions an address, and refuse a spec without one
spec: docs/specs/questions-have-an-address.md
status: completed
ticket: ~

executor: session
agent: implementer
model: opus
estimate: 90min
autonomy: supervised

depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - scripts/validate-contract.mjs
writes:
  - templates/SPEC.md
  - scripts/lib/frontmatter.mjs
  - scripts/validate-spec.mjs
  - scripts/questions.mjs
  - skills/spec/SKILL.md
  - scripts/test-hooks.mjs

gates: none
---

# ASK-T-01 — Give a spec's questions an address, and refuse a spec without one

## Objective

`node scripts/validate-spec.mjs <dir> --all` refuses a spec that has left `draft` without a named
owner, and checks the cross-cutting fields are answered rather than blank. `templates/SPEC.md` fixes
the shape of an open question: who answers, one plain sentence, **what ships if nobody answers**, and
the technical detail. `node scripts/questions.mjs <spec> --for "<audience>"` prints one audience's
questions on their own, ready to paste to somebody who will never open the repository.

## Pre-conditions

- [x] Three real specs exist to verify against, written by an earlier session from executive material
- [x] Verified: all three carry `owner: ~` and each raises it as its own assumption A-04

## Constraints

- **`owner: ~` is only a defect once the spec leaves `draft`.** A draft is allowed not to know yet;
  an approved spec with no owner is a question with no address, and that is the whole point.
- A role is a valid owner. `~` is not. Do not force an individual where none has been named — the
  APN specs were right to refuse to promote a candidate found in another product's document.
- The plain-sentence version of a question is **not a summary of the technical one**. It states the
  decision and its consequence in the decision-maker's terms; the technical framing stays beside it.
- `questions.mjs` prints and nothing else. It never sends, never edits, never writes into a spec.
- The spec validator must not fail on the specs that already exist in this repository, or it is
  unusable on day one — check that before declaring it done.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `templates/SPEC.md` — `owner` required with its reason; `## Open questions` gains the block shape,
   grouped by audience.
2. `scripts/validate-spec.mjs` — frontmatter, enum, owner-after-draft, cross-cutting answered,
   required sections. Warnings for a question with no stated default.
3. `scripts/questions.mjs` — parse the blocks, `--for`, `--list` to name the audiences found.
4. `skills/spec/SKILL.md` — write questions in the shape, group them, and never leave `owner: ~` on
   an approved spec.
5. `scripts/test-hooks.mjs` — fixtures for both scripts.
6. Run both against the three APN specs, read-only, and report what they say.

## Done when

- [ ] `node scripts/validate-spec.mjs docs/specs --all` exits 0 on this repository's own specs
- [ ] `node scripts/questions.mjs docs/specs/questions-have-an-address.md --list` exits 0
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "validate-spec\|questions.mjs" scripts/test-hooks.mjs` ≥ 2
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `grep -q "If nobody answers" templates/SPEC.md`
- [ ] `claude plugin validate .` passes

## Out of scope

- Sending questions anywhere, and writing answers back into a spec. Both stated in the parent spec.
- Enforcing that contracts may not be written against a spec with open questions. That is Q-01 in the
  parent spec, unanswered, and implementing it would be answering it.

## Notes

The verification that matters is not this repository's specs — it is the three APN ones, written from
real material by a session that had none of this. If the validator does not name their missing owner,
it does not work.

## Amendments

**2026-08-19 · `writes` widened, in the human role, before any code was written outside it.**

`scripts/lib/frontmatter.mjs` was added. The contract could not be completed without it and the
omission was a defect in the contract, not a reason to work around it.

The new validator failed on every spec in this repository *and* on all three real APN specs, with the
same error: the shared frontmatter reader does not understand YAML block scalars — `>-`, `>`, `|`,
`|-`. `templates/SPEC.md` uses them for `flag_reason` and `e2e_reason`, and every spec written from
it therefore does too. Contracts never used them, so the gap survived four months of the parser being
"finished".

Recorded rather than quietly extended: an executor widening its own `writes` mid-flight is what
`core.md` §3 forbids, and the only thing that makes this legitimate is that a human made the change
deliberately, in the contract, before the work continued. The failure is also worth keeping — it was
found by real material, not by a fixture.
