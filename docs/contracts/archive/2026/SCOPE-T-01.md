---
# ─── identity ────────────────────────────────────────────────────────────────
id: SCOPE-T-01
title: A spec skill, a documents-only adoption path, and the git-less mechanism documented
spec: docs/specs/scope-before-code.md
status: completed
ticket: ~

# ─── execution ───────────────────────────────────────────────────────────────
executor: session
agent: implementer
model: opus
estimate: 90min
autonomy: supervised

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []
parallel_safe_with: []
reads:
  - templates/SPEC.md
  - scripts/lib/contract.mjs
  - rules/core.md
writes:
  - skills/spec/SKILL.md
  - skills/init/SKILL.md
  - skills/contract/SKILL.md
  - scripts/test-hooks.mjs
  - docs/getting-started.html
  - README.md

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none
---

# SCOPE-T-01 — A spec skill, a documents-only adoption path, and the git-less mechanism documented

## Objective

A folder holding nothing but requirement documents is a repository Trellis can govern. `/trellis:init`
recognises that case instead of filling a profile with `~` and falling silent; `/trellis:spec` reads
the source documents and produces a spec that keeps **decided**, **assumed** and **missing** apart;
and `.trellis/active` — which already works and is documented nowhere — is written down where a
person without git will look for it.

## Pre-conditions

- [x] Verified in a git-less fixture: the write boundary denies, the Stop gate runs, the validator works
- [x] Verified `textutil` is present on macOS and converts `.docx`; `pandoc` is not installed
- [x] `templates/SPEC.md` exists and is the shape a scope document needs

## Constraints

- **An inference is never presented as a requirement.** The spec skill separates what the source
  states, what it inferred, and what nobody has answered. An assumption laundered into a requirement
  is the single worst thing this skill could produce, and it is worse than refusing to write a spec.
- `/trellis:spec` **stops at `status: draft` and a human gate.** It does not write contracts: at scope
  stage there is nothing real to declare `writes` against, and invented paths are worse than none.
- Unreadable source formats are **reported as unread**, never skipped silently or guessed from a
  filename.
- The documents-only path in `init` must not weaken the normal path — a repo with code keeps behaving
  exactly as it does today.
- No new runtime dependency. `textutil` is invoked when present and its absence is reported, not fatal.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `skills/spec/SKILL.md` — locate the source documents, convert what cannot be read natively and say
   so, read them fully, fill `templates/SPEC.md`, and separate decided / assumed / missing.
2. `skills/init/SKILL.md` — add the documents-only branch: no code signals means every command is `~`
   with a stated reason, the docs directories are created, `.trellis/active` is explained, and
   `git init` is offered rather than assumed.
3. `skills/contract/SKILL.md` — the branching step gains its git-less alternative.
4. `scripts/test-hooks.mjs` — assert the whole git-less path: inert with no marker, enforcing with
   one, and the Stop gate running without a repository.
5. `docs/getting-started.html` and `README.md` — mention that git is not required and name the skill.

## Done when

- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "no git\|without git\|git-less" scripts/test-hooks.mjs` ≥ 1
- [ ] `claude plugin details trellis@skills-dir 2>&1 | grep -q "Skills (3)"`
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `grep -lq "trellis/active" skills/init/SKILL.md skills/contract/SKILL.md` for both files
- [ ] `grep -q "textutil" skills/spec/SKILL.md`
- [ ] `grep -c "assumed" skills/spec/SKILL.md` ≥ 3
- [ ] `node scripts/build-docs.mjs` exits 0
- [ ] `claude plugin validate .` passes

## Out of scope

- Decomposing a spec into contracts. Refused in the spec: there is nothing to declare `writes`
  against before a stack exists.
- Document formats beyond PDF, Markdown, plain text and `.docx`.
- Judging whether the requirements are any good. The skill reports what the source says and what it
  does not.

## Notes

The three skills together are about 730 tokens of always-on description. That is the whole standing
cost; the bodies are only paid when one fires. Worth quoting in the report, because the argument for
keeping the roster small is exactly this number growing.

## Amendments

**2026-08-18 · `done_when` criterion 3, amended in the human role.**

As written it measured `claude plugin details trellis`, without the source suffix. That resolves to
whichever instance of the plugin is *active*, and an installed `trellis@gmstek` shadows the working
copy in `~/.claude/skills/` — so the criterion was reading a frozen snapshot of an earlier commit
rather than the tree being changed. It reported `Skills (2)` while the third skill sat on disk,
correct and undiscovered.

The measuring command was the defect, not the code. `core.md` §5 says to verify the command before
declaring a criterion failed; the time lost chasing a phantom is the cost of not doing that first.
Amended to name the source explicitly.
