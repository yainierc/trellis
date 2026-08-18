---
# ─── identity ────────────────────────────────────────────────────────────────
id: SCOPE-T-02
title: Bound where the spec skill looks, and stop it reading its own output
spec: docs/specs/scope-before-code.md
status: completed
ticket: ~

# ─── execution ───────────────────────────────────────────────────────────────
executor: session
agent: implementer
model: opus
estimate: 45min
autonomy: supervised

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []
parallel_safe_with: []
reads:
  - templates/SPEC.md
writes:
  - skills/spec/SKILL.md

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none
---

# SCOPE-T-02 — Bound where the spec skill looks, and stop it reading its own output

## Objective

`/trellis:spec` says where it will look, how deep, and what it is deliberately not opening — before
it opens anything. It never treats a previously generated spec, contract or decision record as a
source requirement, and it never reads a large pile of documents without showing the list first.

## Pre-conditions

- [x] `skills/spec/SKILL.md` exists and already handles `.pdf`, `.md`, `.txt` and `.docx`

## Constraints

- **The output directories are not sources.** `paths.specs`, `paths.contracts` and `paths.decisions`
  from the profile are where this skill *writes*. Reading a spec it produced earlier as if it were a
  requirement launders yesterday's assumptions into today's decisions, and nothing downstream can
  tell the difference. This is the defect this contract exists to close.
- Never sample silently. If the set is large, show it and ask — a spec built on some of the documents
  is fine, one that does not say which were skipped is not.
- Recursion is bounded and the exclusions are named out loud, not applied quietly.
- Formats stay as they are; this contract changes *where* it looks, not *what* it can read.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. Add a step that establishes the search root: what the user named, or ask. Never assume the whole
   repository.
2. Name the exclusions — VCS and dependency directories, build output, binaries, and the profile's
   own output paths.
3. Require the candidate list to be shown before anything is read, with a threshold above which the
   skill asks instead of reading.
4. Add the matching failure modes.

## Done when

- [ ] `grep -q "paths.specs" skills/spec/SKILL.md` — the output paths are named as non-sources
- [ ] `grep -c "node_modules" skills/spec/SKILL.md` ≥ 1
- [ ] `grep -qi "subdirector\|recurs" skills/spec/SKILL.md`
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `claude plugin details trellis@skills-dir 2>&1 | grep -q "Skills (3)"`
- [ ] `claude plugin validate .` passes

## Out of scope

- New document formats. `.xlsx` and friends are named as unreadable with a suggested export, not
  implemented.
- Any change to how the three buckets work. That part is right.

## Notes

The circular-read trap is the one worth remembering: a repo that has used this skill once has a
`docs/specs/` full of exactly the kind of prose a naive scan would treat as requirements.
