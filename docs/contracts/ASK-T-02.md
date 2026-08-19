---
id: ASK-T-02
title: Publish one audience's questions as a generated page, and never claim to have published one
spec: docs/specs/questions-reach-the-decider.md
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
  - docs/specs/questions-reach-the-decider.md
  - scripts/lib/frontmatter.mjs
  - templates/SPEC.md
writes:
  - skills/ask/SKILL.md
  - scripts/publish-questions.mjs
  - scripts/lib/questions.mjs
  - scripts/questions.mjs
  - scripts/test-hooks.mjs
  - REFERENCE.md
  - README.md

gates: none
---

# ASK-T-02 — Publish one audience's questions as a generated page, and never claim to have published one

## Objective

`node scripts/publish-questions.mjs <spec> --for "<audience>"` writes a self-contained page carrying
that audience's open questions, each with what ships if nobody answers, plus the spec's `Why` and
`Outcome` as read-only context — and nothing below the spec line. The page says on its face that it is
generated and must not be edited. `--record <url>` stores the published URL in `.trellis/published.json`
so the next publish updates the same page instead of minting a link nobody is watching. A new `ask`
skill drives it, and reports which of the two paths it took: published, or printed because publishing
was not available.

## Pre-conditions

- [x] `scripts/questions.mjs` already parses audience-grouped questions and is proven against real specs
- [x] Verified: no hook can publish — a hook is a Node process with no access to the model's tools,
      so the outbound leg has to be a skill that instructs, plus a script that renders

## Constraints

- **The page is generated and never edited.** Same discipline as `docs/reference.html`. It states this
  itself, because a reader who edits it creates the second source of truth the parent spec refused.
- **The audience split must not be duplicated.** `questions.mjs` already implements it; lift it into
  `scripts/lib/questions.mjs` and have both callers use it. Two parsers of one format drift.
- **`questions.mjs` behaviour must not change.** It is already used and already tested; the refactor is
  invisible or it is a defect.
- **The page carries no settled decision.** No `## Decisions`, no `Considered and refused`, no contract
  detail. Publishing a closed decision invites it to be reopened by the reader least equipped to judge
  it, and that is the opposite of what this is for.
- **The script never publishes and never claims to.** It renders a file and prints where it is. Only
  the skill, through the model's own tool, can publish — and only because a person asked.
- **Storing the URL is not optional.** Without it every publish is a new link. If `--record` is not
  called, the skill has not finished.
- The page must hold up in a light and a dark reader, and must not fetch anything from anywhere. It is
  read by somebody outside the repository and it is the only thing they see of this work.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `scripts/lib/questions.mjs` — one reader: frontmatter, `## Open questions`, the audience groups, and
   the per-question blocks. Nothing printed here.
2. `scripts/questions.mjs` — same output as today, now on top of the shared reader.
3. `scripts/publish-questions.mjs` — render the page; `--for`, `--out`, `--record <url>`, `--url`.
4. `skills/ask/SKILL.md` — the two paths, the URL reuse, the honest report, and the refusal to invent a
   published page that does not exist.
5. `scripts/test-hooks.mjs` — fixtures: the page carries the questions and the defaults, carries no
   decisions, round-trips a recorded URL, and `questions.mjs` still prints what it printed.
6. `REFERENCE.md` and `README.md` — the new script, the new skill, and `.trellis/published.json`.

## Done when

- [ ] `node scripts/questions.mjs docs/specs/questions-reach-the-decider.md --list` exits 0
- [ ] `node scripts/publish-questions.mjs docs/specs/questions-reach-the-decider.md --for "Yainier" --out "$TMPDIR/t"` exits 0
- [ ] the rendered page contains `generated`, the owner's name, and `If nobody answers`
- [ ] the rendered page contains no `Considered and refused` and no `## Decisions`
- [ ] `--record` then `--url` returns the same URL it was given
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "publish-questions" scripts/test-hooks.mjs` ≥ 3
- [ ] `grep -c "publish-questions" REFERENCE.md` ≥ 1
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `claude plugin validate .` passes

## Out of scope

- The return leg. `ASK-T-03`, and it is blocked on Q-02.
- Restricting who may publish. That is Q-01, unanswered; the default it ships is the page naming the
  owner, which this contract does implement.
- Any hook change, any contract-line change.

## Notes

The one detail that decides whether this works at all is the stored URL. Everything else is a nicer
version of what `questions.mjs` already does; a link that changes on every publish turns a decision-maker
into somebody commenting into a void, and they will not tell us — they will just stop answering.
