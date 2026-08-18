---
id: lifecycle-archive
title: Finished work leaves the working set
status: approved
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - ARCH-T-01

feature_flag: none
flag_reason: >-
  A file-moving script and a validator change. Nothing runs in production and there is no behaviour
  to switch off.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The property that matters — archiving never breaks a `depends_on` reference — is asserted by
  fixture tests over the validator, which is where a break would surface.
e2e_owner: ~

ceilings: none
---

# lifecycle-archive — Finished work leaves the working set

## Why

`core.md` §10 lists a decay signal: *"Memory and rule files only ever grow → nothing is being pruned,
and the context cost is rising for every session in the repo."* Trellis wrote that signal and then
built exactly the thing that decays. There is no archive concept anywhere: every contract a repository
has ever completed stays in `docs/contracts/`, forever, where the validator walks it and a human
scrolls past it.

OpenSpec closes this with `/opsx:archive` — completed changes move to a timestamped archive. The
convention is right and costs nothing to adopt.

## Outcome

Completed and withdrawn contracts move out of the working set into a dated archive, and a spec whose
contracts have all been archived follows them. What a person and the validator see in
`docs/contracts/` is work that is live or waiting. **Archiving never breaks a `depends_on`
reference** — the graph still resolves across the boundary.

## Decisions

| Decision | Position | Where |
|---|---|---|
| A seventh `archived` status | **Refused.** `status` says how the work ended; location says whether the file is tidied away. Conflating two axes into one enum makes "completed" ambiguous | here |
| What archiving moves | `completed` and `withdrawn` only. `blocked` and `gated` are unfinished, however old | here |
| Reference integrity | The validator reads the archive when resolving `depends_on`, and excludes it from conflict detection — history cannot collide with live work | here |
| Who runs it | A script, not a judgement. Mechanical work belongs on tier 3, not in a skill's prose | here |

**Considered and refused:** archiving automatically on completion, from the Stop gate. Refused — the
gate runs on every close attempt and moving files underneath a running session is how a git status
becomes unreadable. Archiving is a deliberate act, run when the working set is noisy.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`, with the reason in the frontmatter.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `ARCH-T-01` | The archive script, the validator's cross-boundary reference resolution, and the profile path | — |

## Out of scope

- Archiving ADRs. A decision record is never stale — it is superseded, which is a different mechanism
  already described in `core.md` §9.
- Any retention policy beyond an explicit age filter. Deleting is not archiving and this does not delete.
- OpenSpec's own archive. Where OpenSpec owns the specs it owns their lifecycle too.

## Open questions

- Whether `init` should offer to archive on adoption of an existing repo that already has finished
  contracts. Leaning no: a first run should not move a stranger's files.
