---
id: ASK-T-03
title: Land an answer on a spec without being able to change anything else
spec: docs/specs/questions-reach-the-decider.md
status: completed
ticket: ~

executor: session
agent: implementer
model: opus
estimate: 90min
autonomy: supervised

depends_on:
  - ASK-T-02
parallel_safe_with: []
reads:
  - rules/core.md
  - docs/specs/questions-reach-the-decider.md
  - scripts/lib/questions.mjs
writes:
  - scripts/answer-question.mjs
  - scripts/publish-questions.mjs
  - skills/ask/SKILL.md
  - scripts/test-hooks.mjs
  - REFERENCE.md
  - README.md

gates: none
---

# ASK-T-03 — Land an answer on a spec without being able to change anything else

## Objective

`node scripts/answer-question.mjs <spec> --id Q-02 --by "<name>" --answer "<text>"` prints the exact
block it would insert and writes nothing. With `--apply` it inserts it — and then proves that **the
only change to the file is that insertion**, byte for byte, refusing to save if anything else moved.
The `ask` skill gains the return leg: read the comments on the published page, match each one to a
question, draft, stop, and resolve the thread only once the answer is on the spec.

Q-02, answered on the record: *"it is proposed, never written. Claude drafts the amendment and stops;
a human lands it."* This contract is that sentence made mechanical.

## Pre-conditions

- [x] Q-02 is answered on the spec, which is what unblocked this
- [x] `.trellis/published.json` records where the questions were published, so comments can be found
- [x] Verified on a real page: an answer arrived as a comment anchored to `#q-02`, and was landed by
      hand — the round trip works before anything automates part of it

## Constraints

- **The tool may only insert.** Not reword a question, not fix a typo, not renumber, not touch
  frontmatter. After an `--apply`, removing the inserted block must reproduce the original file
  exactly; if it does not, the write is abandoned. This is §2 made checkable rather than promised.
- **No answer without a name.** `--by` is required. An unattributed answer six months on is the same
  as no answer, and worse than an open question because it looks settled.
- **An answered question is not answered twice.** Refuse it and say which answer is already there.
  A second answer is a supersede, and it needs a human deciding which one holds.
- **Nothing reads comments except the skill.** A script has no access to them and must not pretend to.
- **A thread is resolved only after the spec carries the answer** — never before. Resolving first
  tells the person their answer is recorded when it is not.
- Two rendering defects found by the first real published page must be fixed, because the page is the
  only thing a decision-maker ever sees: emphasis spanning a line break is not rendered, and a
  numbered list renders as a paragraph with the digits left in.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `scripts/answer-question.mjs` — locate the question by id, refuse the four refusals above, print by
   default, insert under `--apply`, and verify the insertion is the only change.
2. `scripts/publish-questions.mjs` — the two renderer defects, and nothing else.
3. `skills/ask/SKILL.md` — the return leg: find the URL, read the comments, draft, stop, land, resolve.
   Say plainly that resolving needs Claude activated on the thread, because it will fail otherwise.
4. `scripts/test-hooks.mjs` — fixtures for every refusal, for the insert-only invariant, and for the
   two rendering defects.
5. `REFERENCE.md` and `README.md`.

## Done when

- [ ] `node scripts/answer-question.mjs <spec> --id Q-01 --by "X" --answer "y"` prints and writes nothing
- [ ] `--apply` inserts, and the file with the inserted block removed equals the original byte for byte
- [ ] answering an already-answered question exits non-zero and names the existing answer
- [ ] an answer with no `--by` exits non-zero
- [ ] an unknown question id exits non-zero and lists the ids that exist
- [ ] a rendered page renders `*emphasis across a line break*` and a numbered list as a list
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "answer-question" scripts/test-hooks.mjs` ≥ 5
- [ ] `grep -c "answer-question" REFERENCE.md` ≥ 1
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-spec.mjs docs/specs --all` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `claude plugin validate .` passes

## Out of scope

- Reading comments from a script. It cannot, and a script that shells out to pretend otherwise would be
  the worst thing in this repository.
- Deciding whether an answer is a good one. The tool records who said what and when.
- Anything that moves a spec's `status`. A spec leaving `draft` is a human act.

## Notes

The insert-only proof is the whole point. Everything else here is convenience; that check is the reason
a tool is allowed near a requirement at all. The two renderer defects were found the same way the
frontmatter block-scalar gap was found — by real material, on the first page a person actually read,
not by a fixture.
