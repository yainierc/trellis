---
id: work-allocated-by-person
title: Split a spec into contracts, one per person, with parallelism derived rather than asserted
status: approved
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - PLAN-T-01

feature_flag: none
flag_reason: >-
  A skill, a script and a hook change. Nothing runs in production and there is no behaviour to
  switch off.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The property that matters is that a derived parallel matrix never contradicts the validator, and
  that the per-agent table actually denies. Both are asserted by fixture tests over the real hook.
e2e_owner: ~

ceilings: none
---

# work-allocated-by-person — Split a spec into contracts, one per person, with parallelism derived rather than asserted

## Why

The plan was described out loud, in a meeting, by the person who owns it:

> *"planning the actual sessions that we're going to be working through … **we know which areas Iver
> is going to be working on, Jess is going to be working on, which areas our developer is going to be
> working on** … We want to make sure that we are clear on what each person is going to be doing."*

Trellis cannot do that today. `/trellis:contract` writes **one** contract, interactively, for whoever
is at the keyboard. There is nothing that takes a spec and produces the set of contracts three people
work through in parallel.

Worse, the profile promises something it does not deliver:

```yaml
agents:
  # Write-path boundaries, enforced by the PreToolUse hook. An agent that is not listed may write nothing.
```

**The hook does not read that table.** It is dead configuration, and it is precisely "which areas each
person works on" — so today nothing stops one person writing into another's area.

And a third thing, from `core.md` §1: *"`parallel_safe_with` is an author's assertion, not a proof."*
The validator detects a lying assertion after the fact. Nobody generates the truthful one, so every
contract carries a hand-written guess about which others it may run beside.

## Outcome

A spec becomes a set of contracts with owners and non-overlapping write paths. `parallel_safe_with`
stops being asserted and becomes **derived** — computed from the `writes` sets and the dependency
graph, so the field the validator checks is the field a script produced. The per-agent table in the
profile is enforced by the write boundary, which makes "Iver's areas" a boundary rather than an
intention.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Who computes `parallel_safe_with` | A script, from `writes` and the transitive dependency graph. Never the author, and never the model | here |
| Slicing | A skill — where to cut a spec is judgement, and encoding it as a script would replace judgement with a guess | here |
| An unlisted agent type | Denied, as the profile has always claimed. But **only when an agent type is present**: the main session carries none, and blocking it would make the table unusable | here |
| `implementer: []` | An empty list means *no additional restriction*, not *nothing*. Otherwise the template's own default blocks every write on day one | here |
| Re-running the split | Refused if contracts already exist for that spec. Never clobber a decomposition somebody may have edited | here |

**Considered and refused:** having the slicing skill also assign people automatically from the
profile. Refused — who works on what is a management decision made in a planning meeting, and a tool
that guesses it produces an allocation nobody agreed to and everybody has to unpick.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`. Fixture tests assert the derived matrix agrees with the validator, and that the
per-agent table denies a write outside an agent's areas while leaving the main session alone.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `PLAN-T-01` | The derivation script, the hook enforcement, and the planning skill | — |

## Out of scope

- Assigning people. Refused above.
- Estimating durations or sequencing a calendar. A contract carries an estimate; a schedule is a
  management artefact and not this plugin's business.
- The analyst that produces the spec in the first place. That is `agents/`, still next.

## Open questions

### Yainier Caraballo

**Q-01 · Should a person's area boundary be enforced for humans, or only for subagents?**

The harness only reports `agent_type` for subagents. A human in a session carries none, so the table
cannot bind them — Iver working in Jess's area would not be stopped.

**Answered 2026-08-19 — Yainier Caraballo:** humans too, and as a prompt rather than a refusal.
*"Debería dejarme pero darme un warning donde yo confirme que sé que estoy escribiendo algo de otra
área"* — one person is often both business and developer, and on a larger team the same prompt is
where somebody says "that is Jess's file" out loud. A person identifies themselves with
`git config trellis.role`; the boundary answers `escalate`, never `deny`.
