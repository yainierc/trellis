---
id: ARCH-T-01
title: Move finished contracts out of the working set without breaking the graph
spec: docs/specs/lifecycle-archive.md
status: completed
ticket: ~

executor: session
agent: implementer
model: opus
estimate: 75min
autonomy: supervised

depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - templates/project-profile.yml
writes:
  - scripts/archive.mjs
  - scripts/validate-contract.mjs
  - scripts/lib/contract.mjs
  - scripts/test-hooks.mjs
  - templates/project-profile.yml
  - skills/contract/SKILL.md

gates: none
---

# ARCH-T-01 — Move finished contracts out of the working set without breaking the graph

## Objective

`node scripts/archive.mjs` moves every `completed` and `withdrawn` contract into a dated archive
under the contracts path, and archives a spec once all of its contracts have gone. The validator
still resolves `depends_on` across the boundary, so a live contract may depend on an archived one
without the graph reporting a dangling reference. No new status exists.

## Pre-conditions

- [x] Verified: no archive or pruning concept exists anywhere in the plugin
- [x] Verified: `core.md` §10 already names the decay signal this closes

## Constraints

- **Archiving must never break a `depends_on` reference.** This is the property the whole contract
  turns on: the validator reads archived contracts when resolving ids, and excludes them from
  conflict and cycle detection, because history cannot collide with live work.
- No seventh status. `status` records how the work ended; location records whether it is tidied away.
- The script **moves**, never deletes, and never rewrites a contract's body.
- Dry run by default is not required, but `--dry-run` must exist and must be the thing a person
  reaches for first — print exactly what would move, and move nothing.
- A contract that would land on an existing archived path is a conflict, not an overwrite: report it
  and skip that file.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `templates/project-profile.yml` — add `paths.archive`, defaulting under the contracts path.
2. `scripts/lib/contract.mjs` — a shared reader that walks contracts including the archive, so the
   validator and the script agree on what exists.
3. `scripts/validate-contract.mjs` — resolve `depends_on` against live + archived; keep conflict and
   cycle detection to live contracts only.
4. `scripts/archive.mjs` — `--dry-run`, `--older-than <days>`, spec archiving when its wave is empty.
5. `scripts/test-hooks.mjs` — assert the reference-integrity property and the dry run.
6. `skills/contract/SKILL.md` — one line on when to archive.

## Done when

- [ ] `node scripts/archive.mjs --dry-run` exits 0 and writes nothing
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "archive" scripts/test-hooks.mjs` ≥ 3
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `grep -q "archive" templates/project-profile.yml`
- [ ] `claude plugin validate .` passes

## Out of scope

- Archiving ADRs, deleting anything, and OpenSpec's own archive. All three stated in the spec.
- Running archiving automatically from any hook. Refused in the spec with its reason.

## Notes

The dangling-reference case is the one to get right: archive `HOOKS-T-01` while something still
declares `depends_on: [HOOKS-T-01]` and the validator must stay quiet.
