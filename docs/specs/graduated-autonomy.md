---
# ─── identity ────────────────────────────────────────────────────────────────
id: graduated-autonomy
title: Let a contract carry itself to merge when the platform can prove it is safe
status: approved
owner: Yainier Caraballo
date: 2026-08-18
supersedes: none

# ─── the wave ────────────────────────────────────────────────────────────────
contracts:
  - AUTO-T-01

# ─── cross-cutting ───────────────────────────────────────────────────────────
feature_flag: none
flag_reason: >-
  The switch already exists and is not a feature flag: `project.autonomy` in the repo profile is the
  repository's ceiling, and it is configuration a human owns rather than state a runtime toggles.

flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The real end-to-end path ends in a merge on a live remote, which cannot be exercised from a test
  suite without merging something. What is testable is every decision that leads there, and that is
  covered by fixture-based hook tests: each precondition is asserted to deny on its own.
e2e_owner: ~

ceilings: none
---

# graduated-autonomy — Let a contract carry itself to merge when the platform can prove it is safe

## Why

`core.md` §4 makes push, pull request and merge absolute human gates. That is the right default and it
is also, for a whole class of work, pure friction: a typo fix, a formatting pass, a dependency bump or
an added test has nothing a human review can catch that CI cannot, and stopping it at hand-over means
somebody clicks a button to approve what a machine already proved.

The distinction that makes relaxing this safe rather than reckless is **who decides the merge**:

- **The agent decides.** It evaluates its own work and merges. This is the defect `core.md` §5 exists
  to prevent — the executor grading itself, with the check running where the executor can influence
  it. Refused outright.
- **The platform decides.** The agent pushes, opens a pull request and requests auto-merge. GitHub
  branch protection and required status checks decide whether it lands. The agent never merges; it
  states an intent that an independent authority may or may not carry out.

The second is not an exception to the enforcement ladder, it is a move *down* it. Today the merge
decision sits at tier 7 — a human remembering to look. Required status checks are tier 5. `rules/README.md`
already says moving a rule down the ladder is always an improvement.

## Outcome

Before creating the implementation branch, `/trellis:contract` asks one question: wait for
confirmation at hand-over, or carry this through to merge. The answer is recorded in the contract,
which is immutable during execution — so an executor **cannot grant itself autonomy**.

When autonomy is granted and every precondition holds, the executor may push its task branch, open a
pull request and enable auto-merge. When any precondition fails, it is refused with the reason and
falls back to hand-over. Nothing about the supervised path changes.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Who merges | The platform, never the agent. `gh pr merge --auto` only; a bare `gh pr merge` stays denied | `docs/adr/0003-graduated-autonomy.md` |
| Where the grant is recorded | The contract, in the immutable-during-execution set | here |
| When the human is asked | After the contract validates, before the branch — the last cheap moment, and the human sees `writes` and `done_when` first | here |
| How eligibility is determined | **Not detected.** A human grants it per contract; the ADR carries guidance, not a rule a machine evaluates | here |
| Effective level | `min(profile ceiling, contract request)`. A repo can forbid what a contract asks | here |
| Failure direction | Guards fail open; **exceptions fail closed**. If a precondition cannot be verified, autonomy is refused | here |

**Considered and refused:** classifying a diff as low-risk automatically — docs-only, formatting-only,
lockfile-only. Refused for the same reason feature-flag detection was refused in
`feature-flag-governance`: the structural signals correlate weakly with the real risk, a wrong
positive here merges something nobody looked at, and `core.md` §12 already records that the framework
makes questions unforgettable rather than answering them. The human answers, once, per contract.

**Considered and refused:** checking branch protection only when autonomy is granted. Refused —
protection can be removed after the grant, and the check that matters is the one at the moment of the
push. It runs in both places: early for a good error, and again in the hook where it cannot be
bypassed.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`, with the reason in the frontmatter. Every precondition is covered individually by
fixture tests that assert a denial: no protection, protection without required checks, a profile
ceiling of `pr`, a contract that never asked, and `deploy_on_merge` unanswered or true.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `AUTO-T-01` | The autonomy resolver, the hook change, the profile and contract fields, ADR 0003, the §4 amendment, and the question in `/trellis:contract` | — |

## Out of scope

- **Deploy autonomy.** Where a merge to the base branch triggers a production deploy, auto-merge *is*
  auto-deploy and this spec does not cover it. The profile must answer `git.deploy_on_merge`, and
  `true` disqualifies the repository from autonomy entirely. That answer is required, not inferred —
  nothing here tries to detect a deployment pipeline.
- **Relaxing any other gate.** Shared contracts, security controls, schema migrations and feature-flag
  flips remain human decisions under §4 regardless of autonomy.
- Force-pushing and pushing to the base branch. Denied at all times, autonomy or not.

## Open questions

- Which task classes the owner will actually grant this to in practice. The ADR proposes a starting
  list as guidance; evidence over the first month should narrow or widen it. No contract depends on
  the answer, because nothing evaluates the list mechanically.
