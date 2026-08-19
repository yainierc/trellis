# trellis

A contract-driven development framework for AI implementers working under human supervision.
An enrejado guides growth without doing the growing — which is exactly what guardrails do.

Distributed as a Claude Code plugin. Nothing in it knows about any particular company, product or
stack: repo-specific values live in a profile, company rules in a separate rule pack.

## Three layers, versioned separately

| Layer | What it is | Where it lives |
|---|---|---|
| The framework | The method: contracts, gates, the enforcement ladder, the spec→plan→execute→verify→review cycle | This README and `rules/` |
| The plugin | `rules/` `agents/` `skills/` `hooks/` `schemas/` `scripts/` `templates/` | This repository, installed as a plugin |
| The profile | Per-repo calibration: build/test commands, branch names, paths, tracker, write boundaries | `.trellis/profile.yml` in each target repo |

Tuning happens in the profile. If you find yourself editing a skill to fit a repo, the profile is
missing a field — that is the bug, and forking the plugin is not the fix.

## The two ideas everything else follows from

**1. The unit of work is a contract, not a prompt.** A contract declares what may be written, what
it depends on, what may run beside it, and how a machine can tell it is done. That single file is
the scheduling primitive, the executor's brief, the reviewer's rubric, and the audit record.

**2. A rule is enforced at the earliest tier that can express it precisely.**

```
compiler / analyzer → architecture test → hook → runtime test → pipeline script → skill → rule file
└──────────────── mechanical: the model cannot forget ─────────────┘└─ depends on memory ─┘
```

The ladder is not only about reliability. The CLI reports plugin hooks as
`harness-only — no model context cost`, while a rule in `rules/core.md` is paid for in every session
in the repo. **Moving a rule down a tier makes it both unforgettable and free.**

Both matter because the failure mode of AI-assisted development is not incompetence, it is **drift**:
work that is locally reasonable and globally wrong. A contract makes "globally" checkable, and the
ladder makes the check unforgettable.

## Layout

```
trellis/
├── rules/        what must be true of the artifact   → checked
├── agents/       roles with a tool set and a stopping condition → invoked
├── skills/       recurring procedures                → followed
├── hooks/        boundaries the model cannot cross
├── schemas/      per-artifact rules + validators
├── scripts/      the checks hooks and skills call
├── templates/    CONTRACT.md · project-profile.yml · SPEC.md   (ADR.md still missing)
└── profiles/     per-stack command sets
```

When a skill and a rule appear to disagree, **the rule wins and the skill is the bug.**

## Documentation

| Document | For |
|---|---|
| `docs/getting-started.html` | Installing it, then asking Claude Code to adopt it and start work |
| `docs/overview.html` | What a contract is, why the gates exist, the enforcement ladder |

Standalone copies for sharing outside the repo: `node scripts/build-docs.mjs` → `docs/dist/`.

## Status

Early. Built increment by increment, and every rule in `rules/core.md` traces to a real failure in a
real repository rather than to a preference.

| Piece | State |
|---|---|
| `rules/core.md` — framework non-negotiables | ✅ |
| `templates/CONTRACT.md` — the unit of work | ✅ |
| `scripts/validate-contract.mjs` — structural gate | ✅ |
| `templates/project-profile.yml` — the tuning surface | ✅ |
| `templates/SPEC.md` — the wave, and where cross-cutting concerns get decided | ✅ |
| `skills/init` · `skills/spec` · `skills/contract` — adoption, scope from documents, starting work | ✅ |
| `scripts/lib/autonomy.mjs` — graduated autonomy, granted by a human and proved by the platform | ✅ |
| `scripts/archive.mjs` — finished work leaves the working set, without breaking the graph | ✅ |
| `scripts/validate-spec.mjs` · `scripts/questions.mjs` — a spec needs an owner, and its questions an address | ✅ |
| `hooks/` — write boundary, git boundary, Stop gate, per-file lint | ✅ |
| `scripts/lib/` — the shared readers the hooks and the validator both use | ✅ |
| `agents/reviewer` — adversarial review, artifacts only, never the author's report | ✅ |
| `scripts/digest.mjs` — what landed, under which contract, and what nobody could verify | ✅ |
| `skills/plan` · `scripts/parallel-matrix.mjs` — split a spec per person; parallelism derived, not asserted | ✅ |
| `agents/` — analyst, implementer, specialists | next |
| `skills/` — spec, task-start, task-run, task-verify, task-review, task-complete, fleet, index-sync | after |
| `profiles/` — .NET + Angular, Bicep/Azure | after |

## Decisions on record

| Decision | Position |
|---|---|
| Spec-first | Mandatory. Trivial mechanical work (typo, rename, broken build) may proceed without a spec and must be reported as such |
| Orchestrators | Two: an analyst that produces a spec and stops dead at a human gate, and an implementer that executes an approved one |
| Autonomy | Supervised by default: the AI commits in its worktree and stops. A contract a human explicitly grants `autonomy: autonomous` may push, open a PR and request auto-merge — it never merges; required status checks decide (ADR 0003) |
| Stop gate on failure | Records it. The gate marks the contract `blocked` and lets the session close — blocking the stop is how you force a retry, which §8 forbids |
| Executor | A field on the contract: a background subagent by default; a dedicated session above ~3h or across layers |
| Done | Build + lint + fast tests + every `done_when` re-executed by the orchestrator. An adversarial review with zero must-fix findings is required before the PR, and never runs on Stop |
| Cross-cutting concerns | Decided on the spec, never per contract: e2e verification, feature flags, environment ceilings. Detecting them automatically is refused, not pending |
| Feature flags | Stored in the product database, no external service. Every flag declares the contract that deletes it |
| Frontend stack | Angular, with the modern idiom (standalone, signals, `@if`/`@for`, `inject()`, typed forms) enforced by lint — because the model's default is the legacy idiom |
