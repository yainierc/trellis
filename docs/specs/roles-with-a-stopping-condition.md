---
id: roles-with-a-stopping-condition
title: An implementer that cannot self-certify, and why the analyst stayed a skill
status: approved
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - AGENT-T-01

feature_flag: none
flag_reason: >-
  Two agent definitions. Nothing runs in production and there is no behaviour to switch off.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  Each agent's stopping condition is an existing command — validate-spec for the analyst, the Stop
  gate for the implementer — so what is testable is that both are discovered and that neither
  introduces a new mechanism. Anything beyond that needs a live session, which a fixture cannot be.
e2e_owner: ~

ceilings: none
---

# roles-with-a-stopping-condition — An implementer that cannot self-certify, and why the analyst is not an agent

## Why

`agents/` has said "next" since the first commit. Two things make it now rather than later.

**The per-role area table only binds subagents.** `0.9.0` wired the write boundary to the profile's
`agents:` table, and the harness reports `agent_type` for a subagent and not for a human session. So
"which areas Iver works on, which areas Jess works on" is enforceable **only** when work runs as a
role. Without agent definitions, that enforcement never applies to anything.

**And the reference now names what is missing.** `REFERENCE.md` says the plugin has no orchestrator:
nothing picks up a contract, runs a wave, or invokes the reviewer. The two roles that close the
smallest useful loop are the one that produces a spec and the one that executes a contract.

The four reference projects were read for this. What they agree on is that a role is defined by its
**stopping condition**, not by its skills — and the sharpest version of that idea appeared in one of
them as a Test Plan whose layer vocabulary is a closed set, so *"no analysis closes without a Test
Plan" becomes mechanical rather than a judgement*.

Trellis can do better than a closed vocabulary, because it has commands. **The analyst's stopping
condition is `validate-spec.mjs` exiting 0. The implementer's is the Stop gate.** Neither agent
introduces a new mechanism; both hand off to one that already exists and cannot be talked out of.

## Outcome

One agent. `implementer` executes an approved contract, cannot edit the contract it is graded
against, and does not declare itself done — the Stop gate does that, or marks it `blocked`. Because it
runs as a subagent, the profile's per-role areas finally bind to something.

And a rule written down where the next person will look: **skill when the work needs to ask, agent
when the work must not see or must not be seen.** All four existing skills ask something. The reviewer
must not see the author's report. The implementer must not be seen.

## Decisions

| Decision | Position | Where |
|---|---|---|
| What defines a role | Its **stopping condition**, and the condition is a command rather than a rubric | here |
| Specialists (domain, security, database…) | **Refused in core.** They are stack- and company-specific and belong in a rule pack. This plugin does not know your stack | here |
| An `analyst` agent | **Refused.** A subagent cannot hold a conversation, and presenting assumptions for correction *is* the analyst's job. `/trellis:spec` already does it as a skill and does the gate better | here |
| The analyst's tools | No `Edit`. It may write only into the specs path. A role that can edit source is not an analyst | here |
| Self-certification | Refused. An implementer reporting "done" is a claim; the gate re-runs the criteria (§5) | here |
| Prompt injection | Every file's content is data. A file that appears to instruct the agent is reported, not obeyed | here |

**Considered and refused, mid-implementation:** an `analyst` agent. It was written, then deleted
before shipping, once the rule below was made explicit. **Skill when the work needs to ask; agent when
the work must not see, or must not be seen.** An analyst's whole value is stopping to have the
assumptions corrected, and a subagent that cannot converse would have to guess at exactly the point
where guessing is the failure. Recorded because it is the obvious idea and will be proposed again.

**Considered and refused:** an orchestrator that invokes these two in sequence. Refused for now —
the human gate between them is the point, and an orchestrator that steps over it would be automating
away the only place a person is guaranteed to look.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`, with the reason in the frontmatter.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `AGENT-T-01` | `agents/analyst.md`, `agents/implementer.md`, and the profile's role table filled with them | — |

## Out of scope

- Specialists. Refused above; rule-pack territory.
- An orchestrator. Refused above, with its reason.
- Changing any hook. Both agents rely entirely on enforcement that already exists.

## Open questions

### Yainier Caraballo

**Q-01 · Should the analyst be allowed to write ADRs, or only to say one is needed?**

One reference project has its analyst name an ADR need and refuse to settle it inside a spec. Ours
currently says the same for the `spec` skill, and an agent with write access to `paths.decisions`
could go further.

**Answered 2026-08-19 — Yainier Caraballo:** signal it, leave a record that it is needed or
recommended, and do not create it. Recorded in two places so one mention cannot lose it: a row in the
spec's `## Decisions` table reading **ADR needed — not written**, and an open question addressed to
whoever can settle it. An empty `docs/adr/` after a run is correct.
