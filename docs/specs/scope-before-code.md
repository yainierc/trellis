---
id: scope-before-code
title: Be useful before there is a repository, a build or a line of code
status: approved
owner: Yainier Caraballo
date: 2026-08-18
supersedes: none

contracts:
  - SCOPE-T-01

feature_flag: none
flag_reason: >-
  Two skills and a documentation fix. Nothing runs in production and there is no behaviour to switch
  off — a skill behind a flag would be a skill that is sometimes discovered.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The proof is that the plugin governs a folder with no git, no build and no code — which is verified
  by fixture tests asserting the write boundary and the Stop gate work there.
e2e_owner: ~

ceilings: none
---

# scope-before-code — Be useful before there is a repository, a build or a line of code

## Why

The phase where a project is most likely to go wrong is the one before any code exists: requirements
in a PDF, scope in a Word document, nothing decided in writing and no record of what was assumed.
Trellis has nothing to offer there today, which is backwards — that is where a wrong assumption is
cheapest to catch and most expensive to discover later.

Two specific gaps:

- **`/trellis:init` assumes a code repository.** It looks for `.sln`, `package.json`, `angular.json`.
  Pointed at a folder of documents it finds nothing, fills every command with `~`, and says nothing
  useful about what to do next.
- **Nothing turns source documents into a spec.** `templates/SPEC.md` exists and is exactly the right
  shape for a scope, but going from a PDF to a filled-in spec is unaided work.

There is also a mechanism that already works and is effectively hidden. Verified: in a folder with no
git at all, the write boundary, the Stop gate and the validator all function. Contract resolution
falls back to `.trellis/active`, a one-line file naming the contract id — the first of the three
resolution paths, and undocumented everywhere a reader would look.

## Outcome

A person with a folder of requirement documents can say *"adopt trellis here"* and then *"write a
spec from these documents"*, and get a spec that separates what the source **decided**, what was
**assumed** on their behalf, and what is **missing** — with the assumptions flagged for confirmation
rather than presented as requirements.

Trellis stops implying that git is required, and `.trellis/active` is documented where someone hits
the problem.

## Decisions

| Decision | Position | Where |
|---|---|---|
| Git requirement | Not required. Branch resolution is a convenience; `.trellis/active` is the explicit form | here |
| What a spec skill must never do | Present an inference as a requirement. Decided / assumed / missing are separated, always | here |
| Word documents | Converted with `textutil` on macOS, and the conversion is reported. Verified available; `pandoc` is not installed | here |
| Where the skill stops | At `status: draft` and a human gate. It does not write contracts | here |

**Considered and refused:** having `/trellis:spec` also decompose the spec into contracts. Refused —
at scope stage there is nothing to declare `writes` against, and a contract with invented paths is
worse than no contract. Decomposition waits for a stack to exist.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none`. Fixture tests assert the boundary and the gate in a folder with no git and no code.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `SCOPE-T-01` | `skills/spec`, the documents-only path in `skills/init`, `.trellis/active` documented, and tests for the git-less case | — |

## Out of scope

- Decomposing a spec into contracts. Refused above with its reason.
- Reading document formats beyond PDF, Markdown, plain text and `.docx`. Anything else is reported as
  unread rather than guessed at.
- Any attempt to judge whether requirements are *good*. The skill reports what the source says and
  what it does not; assessing the product is not the plugin's business.

## Open questions

- Whether `.trellis/active` should be gitignored by default once a repo exists. Leaning yes — it is
  working state, not a decision — and `init` will do that. No contract depends on it.
