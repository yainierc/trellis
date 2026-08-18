---
# ─── identity ────────────────────────────────────────────────────────────────
id: SKILLS-T-01
title: Adoption and first contract as skills, and a quickstart aimed at the agent
spec: docs/specs/adoption-ergonomics.md
status: completed
ticket: ~

# ─── execution ───────────────────────────────────────────────────────────────
executor: session
agent: implementer
model: opus
estimate: 90min

# ─── scheduling ──────────────────────────────────────────────────────────────
depends_on: []
parallel_safe_with: []
reads:
  - rules/core.md
  - templates/project-profile.yml
  - templates/CONTRACT.md
writes:
  - skills/
  - docs/getting-started.html
  - scripts/build-docs.mjs
  - README.md

# ─── gates ───────────────────────────────────────────────────────────────────
gates: none
---

# SKILLS-T-01 — Adoption and first contract as skills, and a quickstart aimed at the agent

## Objective

Adopting Trellis in a repository is a sentence a person says, not a checklist they execute. Two
skills exist — `init` and `contract` — and the quickstart's first instruction is what to say rather
than what to type. `init` writes no command into a profile that it has not run and watched work,
which closes the one failure that makes the Stop gate untrustworthy.

## Pre-conditions

- [x] `skills/<name>/SKILL.md` is confirmed to be auto-discovered by the running CLI
- [x] `templates/project-profile.yml` and `templates/CONTRACT.md` exist for the skills to copy

## Constraints

- A skill is a **procedure the agent follows**, not a script it shells out to. Encoding the judgement
  calls (is this suite fast? is this the right base branch?) as a bash script would replace judgement
  with a guess, and a guess in a profile is the defect this contract exists to remove.
- `init` must **run every candidate command before writing it**, and must distinguish "command does
  not exist" from "the repo is currently red". Only the first disqualifies a command.
- `init` must never overwrite an existing `.trellis/profile.yml` without showing it and asking.
- Both skills carry a failure-mode table with real symptoms, per `core.md` §11.
- Skill descriptions must name the phrases a user actually says. A skill that is never matched is a
  skill that does not exist.
- Paths inside skills use `${CLAUDE_PLUGIN_ROOT}`, never a path from the author's machine.
- Do not touch files outside the `writes` list.
- Do not edit this contract's `writes`, `constraints` or `done_when`.
- Do not push, open a pull request, merge, or switch branches.

## Steps

1. Write `skills/init/SKILL.md` — detect the stack, verify commands, write the profile, create the
   directories, and close by stating the two conditions that arm enforcement.
2. Write `skills/contract/SKILL.md` — establish the work, fill the template with `writes` and
   `done_when` treated as the load-bearing fields, validate, branch, then let the gate close it.
3. Rewrite `docs/getting-started.html` for an agent-first flow: what to say comes first, the manual
   steps become reference.
4. Update the README so the documentation index and the status table describe what exists.
5. Rebuild the standalone documents.

## Done when

- [ ] `claude plugin details trellis@skills-dir` reports both skills — `grep -c "contract\|init"` ≥ 1 on its output
- [ ] `node scripts/validate-contract.mjs docs/contracts --all` exits 0
- [ ] `node scripts/test-hooks.mjs` exits 0
- [ ] `find scripts hooks -name '*.mjs' -exec node --check {} \;` exits 0
- [ ] `grep -c "CLAUDE_PLUGIN_ROOT" skills/init/SKILL.md skills/contract/SKILL.md | grep -cv ':0' ` equals 2
- [ ] `grep -c "Failure modes" skills/init/SKILL.md skills/contract/SKILL.md | grep -cv ':0'` equals 2
- [ ] `grep -q "trellis:init" docs/getting-started.html` — the quickstart leads with the skill
- [ ] `node scripts/build-docs.mjs` exits 0 and `test -s docs/dist/getting-started.html`
- [ ] `claude plugin validate .` passes

## Out of scope

- `verify`, `review` and `fleet` skills. The Stop gate already re-executes criteria unprompted, so a
  `verify` skill would duplicate a hook; the others need agents that do not exist.
- `bin/` executables on PATH. Deferred in the spec — the mechanism could not be verified here.
- The status line. Discussed, wanted, and not this wave.

## Notes

The context cost is worth quoting in the report: `claude plugin details` prices the always-on cost of
a skill (its description alone) separately from the on-invoke cost. Skills are not free the way hooks
are, and the difference is the argument for keeping the roster small.
