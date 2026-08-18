# ADR 0003 — A contract may carry itself to merge when the platform can prove it is safe

- **Status:** accepted
- **Date:** 2026-08-18
- **Amends:** `rules/core.md` §4

## Context

§4 makes push, pull request and merge absolute human gates. For most work that is right. For a typo
fix, a formatting pass, a dependency bump or an added test it is friction with no yield: a person
clicks approve on something a machine already proved, and the habit of clicking approve without
reading is worse than not asking.

## Decision

A contract may be granted the right to **push its task branch, open a pull request, and request
auto-merge**. It is never granted the right to merge.

That distinction is the whole decision. `gh pr merge --auto` does not merge; it tells GitHub to merge
*if its required status checks pass*. The authority is CI, running where the executor cannot reach it.
A bare `gh pr merge` remains denied at every level, autonomy or not.

Read against the enforcement ladder, this is not an exception to the framework — it is a move **down**
it. The merge decision sits today at tier 7, a human remembering to look. Required status checks are
tier 5. `rules/README.md` already holds that moving a rule down the ladder is always an improvement.

### Preconditions, all of which must hold at the moment of the push

1. The repo profile declares `project.autonomy: auto-merge` — the repository's ceiling.
2. The contract declares `autonomy: autonomous` — granted by a human, before the branch existed,
   recorded in the set that is immutable during execution.
3. `git.deploy_on_merge` is answered `false`. Unanswered is a refusal.
4. The base branch has protection with **at least one required status check**.

The effective level is `min(ceiling, grant)`. A repository can forbid what a contract asks for.

### Guards fail open; exceptions fail closed

The hooks deliberately fail open: one that cannot resolve a contract allows the call, because a
guardrail that blocks ordinary work gets uninstalled and then protects nothing.

Autonomy inverts that. If a precondition cannot be **verified** — no remote, `gh` unavailable, the API
call times out — the answer is `supervised`. A guard that fails open costs a missed catch; an exception
that fails open grants a merge nobody checked.

## Considered and refused

**The agent decides.** It evaluates its own work and merges. Refused: this is the executor grading
itself, with the check running where it can influence the result, which is exactly what §5 exists to
prevent.

**Classifying a diff as low-risk automatically** — docs-only, formatting-only, lockfile-only. Refused
on the same grounds feature-flag detection was refused in ADR 0002's sibling spec: the structural
signals correlate weakly with real risk, and a wrong positive here merges something nobody looked at.
**Eligibility is granted by a human, per contract, once.** The list below is guidance for the person
answering, not a rule anything evaluates.

**Checking branch protection only when autonomy is granted.** Refused: protection can be removed
between the grant and the push. The check runs in the hook, live, every time.

**Trusting `allow_auto_merge` alone.** Refused: the repository setting only enables the feature. A
protected branch with no required checks still merges instantly.

## Guidance on what to grant

Reasonable starting set: documentation, formatting and lint fixes, dependency bumps whose tests pass,
added tests, typo and rename changes confined to one contract's `writes`.

Never, whatever the profile says — these remain human under §4:

- schema changes and migrations. A merge is revertible; a migration is not.
- shared contracts: a port interface, a shared host or bootstrap, a published schema.
- anything that weakens an isolation or security control.
- turning a feature flag on or off — ADR 0002 records that as equivalent to a deploy.
- any repository where a merge to the base branch triggers a production deploy. There, auto-merge *is*
  auto-deploy, and this record does not cover it.

## Consequences

- `core.md` §4 is amended rather than replaced: the gates remain gates, with one narrow delegation.
- §10 gains a decay signal. **If an auto-merged change has to be reverted, the eligibility criteria are
  wrong** — and they are narrowed, not excused.
- The adversarial review in `gates.pre_pr` stops being advisory on this path. It is the last
  non-mechanical check before something lands without a person reading it.
- A repository that wants autonomy has to invest in CI first. That is the point: the friction moves
  from reviewing every change to building checks worth trusting, once.

**Accepted is not validated.** This owes evidence: the first month of auto-merged contracts, and
whether any of them had to be reverted.
