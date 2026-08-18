---
id: adoption-ergonomics
title: Adoption is something you ask for, not something you perform
status: approved
owner: Yainier Caraballo
date: 2026-08-18
supersedes: none

contracts:
  - SKILLS-T-01

feature_flag: none
flag_reason: >-
  Skills and documentation. There is no runtime surface to switch off, and a plugin component behind
  a flag would be a component that is sometimes discovered.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The end-to-end proof is that the CLI discovers both skills and reports their real context cost,
  which is checked as a `done_when` criterion rather than by a test runner.
e2e_owner: ~

ceilings: none
---

# adoption-ergonomics — Adoption is something you ask for, not something you perform

## Why

Getting a repository onto Trellis currently means a human reading a page and executing six steps by
hand: copy a template, work out this repo's build command, guess whether the test suite is fast,
create three directories, remember to gitignore the scratch path, then remember that none of it does
anything until the branch matches a pattern.

Every one of those steps is something an agent sitting in the repository can do better than a person
reading a page, because it can *look*. It can read `package.json` scripts instead of assuming
`npm test`, and — the part a human skips — it can **run each candidate command and watch whether it
works** before writing it into the profile.

The failure this prevents is specific and expensive: a profile containing a plausible command that
does not exist. The Stop gate runs those commands on every attempt to close a session, so a wrong one
marks healthy work `blocked` and sends someone debugging code that is fine.

## Outcome

A person installs the plugin with two commands, then says *"adopt trellis in this project"* and
answers a question or two. Starting a piece of work is *"start a contract for X"*. The manual steps
still exist and still work, but they become reference rather than the path.

The quickstart is rewritten for the reader it actually has. Its first instruction is what to say, not
what to type.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Where adoption logic lives | A skill the agent follows, not a script it runs | here |
| Which skills ship now | `init` and `contract` — the two things the old page walked through by hand | here |
| Commands are verified, not inferred | `init` runs every candidate before writing it | here |
| `bin/` executables on PATH | Deferred — could not be verified in this environment, and shipping an unverified mechanism to shorten a path is not worth it | here |

**Considered and refused:** a `SessionStart` hook that offers to adopt the repo automatically.
Refused — it would fire in every repository the plugin is installed in, including the ones that
deliberately have not opted in, and an unsolicited prompt on every session start is how a tool
becomes an irritant.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`. The equivalent proof is `claude plugin details` reporting both skills, which is a
`done_when` criterion on the contract.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `SKILLS-T-01` | `skills/init`, `skills/contract`, and the rewritten quickstart | — |

## Out of scope

- Lifecycle skills beyond starting work: `verify`, `review`, `fleet`. The Stop gate already
  re-executes criteria without being asked, so `verify` would duplicate a hook; the rest need agents.
- `bin/` wrappers. Deferred with the reason above.
- The status line discussed earlier. Still worth doing, still not this wave.

## Open questions

- Whether `init` should offer to write a `CLAUDE.md` pointer so a session finds the rules without the
  plugin being installed. No contract depends on the answer.
