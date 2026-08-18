---
# ─── identity ────────────────────────────────────────────────────────────────
id: FLAGS-T-01
title: Spec template, flag ADR, and the two rules they rest on
spec: docs/specs/feature-flag-governance.md
status: completed
ticket: ~

# ─── execution ───────────────────────────────────────────────────────────────
executor: session
agent: implementer
model: opus
estimate: 60min

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []
parallel_safe_with: []
reads:
  - rules/README.md
  - templates/CONTRACT.md
  - docs/adr/0001-e2e-belongs-to-the-wave.md
writes:
  - templates/SPEC.md
  - docs/adr/0002-feature-flags-live-in-the-database.md
  - rules/core.md
  - README.md

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none
---

# FLAGS-T-01 — Spec template, flag ADR, and the two rules they rest on

## Objective

The feature-flag question can no longer be skipped by omission: a spec carries a mandatory answer
where `none` is valid and silence is not, and every flag that does get created carries the contract
that deletes it. The reason cross-cutting concerns keep landing in the wrong place is stated once as
a rule rather than rediscovered per topic. `templates/SPEC.md`, promised in the README since the
first commit, exists and has a real user.

## Pre-conditions

- [x] `docs/adr/0001-e2e-belongs-to-the-wave.md` exists — §12 generalises its reasoning
- [x] The database-only decision is the human's, already taken, and needs recording rather than deciding

## Constraints

- Documents only. No code, no validator change: requiring the new field mechanically would invalidate
  the existing contract set, and `schemas/` has no spec validator yet. Deferred with its reason in
  the spec.
- Spec frontmatter stays **flat**. `scripts/lib/frontmatter.mjs` reads scalars, inline arrays and
  block lists; a nested map would parse as nothing and the future validator would read a spec that
  says less than its author wrote.
- New rules are **appended** as §12 and §13. Renumbering is forbidden here: the hook handlers cite
  §2, §3, §4, §5 and §7 in the messages a model reads when it is denied, and shifting those numbers
  silently invalidates every one of them.
- Every rule added traces to a named failure, not to a preference. That is the bar `core.md` sets in
  its own first paragraph.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints` or `done_when`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. Write `templates/SPEC.md`: flat frontmatter carrying `feature_flag`, `flag_reason`,
   `flag_default`, `flag_retire_by`, `flag_retired_by`, `e2e`, `e2e_reason`, `e2e_owner` and
   `ceilings`, plus the body sections a wave needs.
2. Write `docs/adr/0002-feature-flags-live-in-the-database.md` — the decision, the refused
   alternatives with their reasons, and the consequences the choice actually carries.
3. Append `core.md` §12 — cross-cutting concerns belong to the wave — and point the existing §1 E2E
   bullet at it.
4. Append `core.md` §13 — every flag declares its own removal.
5. Update the README status table and layout so they describe what exists.

## Done when

- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "^## 12\.\|^## 13\." rules/core.md` equals 2
- [ ] `grep -c "flag_retired_by\|flag_retire_by" templates/SPEC.md` ≥ 2
- [ ] `grep -c "feature_flag\|e2e_reason\|ceilings" docs/specs/feature-flag-governance.md` ≥ 3
- [ ] `grep -q "0002-feature-flags" rules/core.md` — §13 cites its decision record
- [ ] `grep -c "SPEC.md" README.md` ≥ 1
- [ ] `claude plugin validate .` passes

## Out of scope

- The flag mechanism: schema, read API, caching, naming. Rule-pack territory; the core plugin does
  not know a database exists.
- Any validator or hook that checks the new field. Deferred in the spec with its reason.
- `templates/ADR.md`. Still missing, still promised by the README, and named in the spec's out of
  scope so it is a recorded gap rather than an oversight.

## Notes

The frontmatter of the parent spec is itself the acceptance test for the template: if writing a real
spec with it requires bending a field, the template is wrong and not the spec.
