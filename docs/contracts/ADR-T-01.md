---
id: ADR-T-01
title: A template for a decision record, and a check that superseding cannot be half-done
spec: docs/specs/decisions-that-stay-decided.md
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
  - docs/adr/0001-e2e-belongs-to-the-wave.md
writes:
  - templates/ADR.md
  - scripts/validate-adr.mjs
  - scripts/test-hooks.mjs
  - README.md
  - REFERENCE.md

gates: none
---

# ADR-T-01 — A template for a decision record, and a check that superseding cannot be half-done

## Objective

`templates/ADR.md` exists, carrying the spine three hand-written records converged on and the
`supersedes` mechanism §9 requires and never described. `node scripts/validate-adr.mjs docs/adr --all`
refuses a record that supersedes one still marked `accepted`, and refuses one marked `superseded` that
nobody claims to have replaced — both directions, because either half alone leaves a false record on
disk that somebody will cite.

## Pre-conditions

- [x] Verified: `templates/ADR.md` is named in the README's layout and does not exist
- [x] Verified: the three existing records share `Context · Decision · Considered and refused · Consequences`
      and all three close with "Accepted is not validated"
- [x] Verified: §9 requires a new ADR to relitigate a decision and says nothing about marking the old one

## Constraints

- **The spine is derived, not invented.** Take the sections the three records already share. A standard
  shape nobody here uses would be a worse template than the one that emerged.
- **`## Considered and refused` is required on an accepted record.** §9: *"that record is the only thing
  stopping it from being re-proposed as a fresh idea."* A record without it keeps the outcome and loses
  the reason, which is the half that mattered.
- **Superseding is checked in both directions.** A new record naming a predecessor that is still
  `accepted`, and a record marked `superseded` that nothing replaces, are both errors.
- **No skill.** Refused in the spec: the discipline goes at tier 3, and a skill would cost a hundred
  tokens in every session to restate what the template carries.
- The validator judges **presence, never soundness**. Whether a decision is right is what the human gate
  and time are for.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints`, `done_when` or `autonomy`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. `templates/ADR.md` — frontmatter with `status`, `date`, `supersedes`/`amends`; the four required
   sections with prose guidance in each; the closing "accepted is not validated".
2. `scripts/validate-adr.mjs` — required fields and sections, status enum, the two-way supersede check,
   and a warning when an accepted record never says what it costs.
3. `scripts/test-hooks.mjs` — both halves of the supersede invariant, and a record missing its refusals.
4. `README.md` and `REFERENCE.md` — the template is no longer missing, and the validator exists.

## Done when

- [ ] `node scripts/validate-adr.mjs docs/adr --all` exits 0 on the three existing records
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "adr" scripts/test-hooks.mjs` ≥ 4
- [ ] `grep -q "Considered and refused" templates/ADR.md`
- [ ] `grep -q "supersede" scripts/validate-adr.mjs`
- [ ] `grep -c "ADR.md still missing" README.md` equals 0
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `claude plugin validate .` passes

## Out of scope

- An `adr` skill. Refused in the spec.
- Archiving decision records — §9 supersedes rather than files away, and `archive.mjs` already leaves
  them alone deliberately.
- Requiring a named accepter. `Q-01` in the spec is open and implementing it would answer it.

## Notes

The two-way check is the part that earns this contract. A record marked `superseded` that nothing
replaced, and a live record quietly overtaken, are the same defect seen from opposite ends — and the
second one is worse, because it reads as current.
