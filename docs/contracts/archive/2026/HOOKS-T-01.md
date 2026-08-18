---
# ─── identity ────────────────────────────────────────────────────────────────
id: HOOKS-T-01
title: Enforce core.md §2–§6 as harness hooks
spec: docs/specs/enforcement-hooks.md
status: completed
ticket: ~

# ─── execution ───────────────────────────────────────────────────────────────
executor: session
agent: implementer
model: opus
estimate: 180min

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - templates/project-profile.yml
  - templates/CONTRACT.md
writes:
  - hooks/
  - scripts/lib/
  - scripts/test-hooks.mjs
  - scripts/validate-contract.mjs

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none
---

# HOOKS-T-01 — Enforce core.md §2–§6 as harness hooks

## Objective

Four rules that today live in prose become mechanical, and cost nothing in context to enforce: an
executor cannot write outside its contract's `writes`, cannot edit the contract it is being graded
against, cannot push or open a pull request or switch branches, and cannot close a session leaving a
red build silently reported as done. After this contract, `rules/core.md` §2, §3, §4 and §5 are
enforced at tier 3 of the enforcement ladder instead of tier 7.

## Pre-conditions

- [x] The harness hook contract is verified against the running CLI, not recalled — see the spec
- [x] The three open design decisions are settled and recorded in the spec
- [x] `.trellis/profile.yml` exists for this repository

## Constraints

- Node ESM, zero runtime dependencies, no build step. The plugin must work on a clone plus Node.
- Logic already in `scripts/validate-contract.mjs` — frontmatter parsing, segment-aware path
  overlap — is **extracted into `scripts/lib/` and imported by both**, never copied. Two copies of
  the overlap rule that disagree is the exact defect the rule exists to prevent.
- Fail open when no contract resolves; fail closed when one does. See the spec, decision 2.
- The Stop gate never exits 2. See the spec, decision 3.
- Every hook must be inert and silent when the repository has no `.trellis/profile.yml`.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints` or `done_when`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. Extract `scripts/lib/frontmatter.mjs` and `scripts/lib/paths.mjs` from the validator, and rewire
   `validate-contract.mjs` to import them.
2. Add `scripts/lib/yaml.mjs` — a nested-YAML subset reader for the profile, deliberately narrow and
   loud when it meets something it does not support.
3. Add `scripts/lib/profile.mjs` and `scripts/lib/contract.mjs` — repo root discovery, profile load
   with defaults, and active-contract resolution in the order the spec fixes.
4. Add `scripts/lib/hook.mjs` — stdin event reading and the allow/deny/report vocabulary.
5. Write the four handlers under `hooks/handlers/` and wire them in `hooks/hooks.json`.
6. Write `scripts/test-hooks.mjs`: a throwaway fixture repository, synthetic events, asserted
   outcomes — including the fail-open cases, not only the denials.

## Done when

- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `grep -c "from './lib/" scripts/validate-contract.mjs` ≥ 1
- [ ] `grep -rn "permissionDecision" scripts/lib/hook.mjs | wc -l` ≥ 2
- [ ] `grep -rn "exit(2)" hooks/handlers/stop-gate.mjs | wc -l` equals 0
- [ ] `claude plugin validate .` reports the plugin valid with hooks discovered

## Out of scope

- Agents and skills. The hooks must work with a human driving, before any role exists — if they
  need an orchestrator to function, they are not tier-3 enforcement.
- The `agents:` write table in the profile, beyond passing `agent_type` through to the handlers.
- Any stack-specific command. Those belong in a profile, not in this plugin.
- Sandboxing or adversarial containment. Stated in the spec and repeated here because it is the
  thing a reader will most reasonably expect and will not get.

## Notes

The `if` field on a hook entry does most of the git boundary declaratively, including
`VAR=x git push` and `$(...)` contents. Prefer it over parsing commands in the handler; the handler
classifies only to pick the right message.

`Stop` and `SubagentStop` both need wiring — a subagent executor closing is the same event for the
framework's purposes.

## Amendments

**2026-08-18 · `done_when` criterion 5, amended in the human role, not by the executor.**

As written it was `grep -rn "permissionDecision" hooks/handlers/ | wc -l` ≥ 2. It failed — correctly.
The criterion assumed each handler would spell the deny payload out itself, which contradicts the
constraint in this same contract that shared logic is extracted rather than copied. The literal
lives once in `scripts/lib/hook.mjs`, which is the design the constraints asked for.

Two clauses of one contract were in tension and the criterion was the defective one. Recorded rather
than quietly rewritten, because an executor silently relaxing a criterion it just failed is the
governance defect `core.md` §2 exists to prevent — the fix is only legitimate because a human made
it, deliberately, after verifying the measuring command per §5.
