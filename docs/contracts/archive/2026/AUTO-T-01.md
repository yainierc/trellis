---
# ─── identity ────────────────────────────────────────────────────────────────
id: AUTO-T-01
title: Graduated autonomy — granted by a human, proved by the platform
spec: docs/specs/graduated-autonomy.md
status: completed
ticket: ~

# ─── execution ───────────────────────────────────────────────────────────────
executor: session
agent: implementer
model: opus
estimate: 150min

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - docs/adr/0002-feature-flags-live-in-the-database.md
writes:
  - scripts/lib/autonomy.mjs
  - hooks/handlers/git-boundary.mjs
  - scripts/test-hooks.mjs
  - scripts/validate-contract.mjs
  - templates/project-profile.yml
  - templates/CONTRACT.md
  - skills/contract/SKILL.md
  - docs/adr/0003-graduated-autonomy.md
  - rules/core.md

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none
---

# AUTO-T-01 — Graduated autonomy — granted by a human, proved by the platform

## Objective

A contract can be granted the right to carry itself to merge, and that grant is worth something
because the executor cannot give it to itself and cannot merge even when it has it. `/trellis:contract`
asks the question before the branch exists; the answer lives in the contract's immutable set; the
git boundary permits exactly `git push` of the task branch, `gh pr create` and `gh pr merge --auto`,
and only when every precondition — repo ceiling, contract grant, `deploy_on_merge: false`, and live
branch protection with required status checks — holds at the moment of the call.

## Pre-conditions

- [x] `docs/specs/graduated-autonomy.md` is approved
- [x] The current behaviour is verified: the hook denies `gh pr create` under contract today
- [x] It is verified that this repository has no branch protection and `allow_auto_merge: false`, so
      the unsafe path is reachable and the precondition check is not theoretical

## Constraints

- **Autonomy is an exception, so it fails closed.** Guards fail open — a hook that cannot resolve a
  contract allows the call. An exception inverts that: if any precondition cannot be *verified*,
  autonomy is refused. Never grant on an unread signal.
- **`gh pr merge` without `--auto` stays denied at all times.** The agent states an intent; the
  platform performs the merge. That distinction is the entire safety argument and must not blur.
- Force-push, push to the base branch, `git merge`, `git rebase` and branch switching stay denied
  under a contract regardless of autonomy.
- Branch protection is checked **in the hook**, not only when autonomy is granted — protection can be
  removed after the grant. The check has a timeout and a refusal on timeout.
- Adding `autonomy` to the contract must not invalidate the existing contract set: absent means
  `supervised`. The validator checks the enum only when the field is present.
- §4 is amended, not deleted. The gates remain gates; the amendment names the one narrow condition
  under which push and pull-request creation are delegated, and cites ADR 0003.
- No new runtime dependency. `gh` is invoked as a subprocess and its absence is a refusal, not a crash.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints` or `done_when`.
- Do not push, open a pull request, merge, or switch branches — this contract is `supervised`.

## Steps

1. `scripts/lib/autonomy.mjs` — resolve the effective level from the profile ceiling, the contract
   grant, `git.deploy_on_merge`, and a live branch-protection check that requires at least one
   required status check. Return the level plus the reason it was refused.
2. `hooks/handlers/git-boundary.mjs` — consult the resolver before denying push and `gh pr create`,
   keep every other denial, and keep a bare `gh pr merge` denied.
3. `templates/project-profile.yml` — document `autonomy: pr | auto-merge` and add
   `git.deploy_on_merge`, required when the ceiling is `auto-merge`.
4. `templates/CONTRACT.md` — add `autonomy: supervised` to the frontmatter with the explanation that
   a human answers it before the branch.
5. `scripts/validate-contract.mjs` — validate the `autonomy` enum when present.
6. `skills/contract/SKILL.md` — ask the question after validation and before branching, present both
   options with their consequences, and record the answer.
7. `docs/adr/0003-graduated-autonomy.md` and the `core.md` §4 amendment plus a §10 decay signal.
8. `scripts/test-hooks.mjs` — one asserted denial per precondition, and one asserted allow for the
   fully satisfied path.

## Done when

- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `grep -c "autonomy" scripts/test-hooks.mjs` ≥ 6
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `grep -q "0003-graduated-autonomy" rules/core.md`
- [ ] `grep -c "deploy_on_merge" templates/project-profile.yml scripts/lib/autonomy.mjs | grep -cv ':0'` equals 2
- [ ] `grep -q "merge --auto" hooks/handlers/git-boundary.mjs`
- [ ] `grep -q "autonomous" skills/contract/SKILL.md`
- [ ] `claude plugin validate .` passes

## Out of scope

- Deploy autonomy. `deploy_on_merge: true` disqualifies a repository and nothing here tries to detect
  a deployment pipeline.
- Automatic eligibility classification of a diff. Refused in the spec with its reason.
- Relaxing any other §4 gate.

## Notes

The failure this design is guarding against is not a bad merge — CI catches those. It is a *plausible*
grant: autonomy resolved from a signal nobody checked, on a branch nobody protected. That is why the
precondition check is live, in the hook, and refuses on timeout.
