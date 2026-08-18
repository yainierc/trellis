---
name: spec
description: Turn requirement documents into a Trellis spec, keeping what was decided, what was assumed and what is missing strictly apart. Use when the user says "write a spec from these documents", "here are the requirements", "turn this scope into a spec", or is starting a project with documents but no code.
---

# Write a spec from source documents

This runs at the point where a project is most likely to go wrong: requirements exist as prose,
nothing is written down as a decision, and nobody has listed what was never answered. The output is a
spec — but the value is not the spec, it is the **separation**.

> Everything you produce falls into exactly one of three buckets: what the source **decided**, what
> you **assumed**, and what is **missing**. An assumption presented as a requirement is the worst
> possible output of this skill — worse than producing nothing, because it looks like agreement.

## Steps

### 1. Find the sources and say what you can and cannot read

List every candidate document. Then, per format:

| Format | How |
|---|---|
| `.pdf` | Read it directly. Long documents come in page ranges; read all of them, do not sample |
| `.md`, `.txt` | Read directly |
| `.docx` | **Cannot be read directly.** On macOS: `textutil -convert txt -stdout <file>`. `pandoc -t plain <file>` where available |
| anything else | **Report it as unread.** Never infer content from a filename |

State the list before you start: what you read, what you converted and how, and what you could not
open. A spec built on three of five documents is fine — a spec that does not say which two were
skipped is not.

### 2. Read everything before writing anything

Requirements contradict each other across documents, and the contradiction is usually the most
important thing on the page. You cannot see it having read one file.

While reading, keep the three buckets explicitly:

- **Decided** — the source says it, in words you could quote.
- **Assumed** — you concluded it. Anything you filled in because it seemed obvious belongs here, and
  the reader must be able to see every one of these at a glance.
- **Missing** — the source does not answer it, and someone has to.

When you are unsure whether something is decided or assumed, **it is assumed.** That rule costs a
question; the opposite costs the project.

### 3. Fill the template

Copy `${CLAUDE_PLUGIN_ROOT}/templates/SPEC.md` into the repo's specs path and fill it in.

- **`## Why`** — the problem in the source's own terms, not the solution.
- **`## Outcome`** — what is true when this lands. Concrete enough that someone can check it.
- **`## Decisions`** — only the *decided* bucket, each row traceable to a document. Anything you
  inferred does not go here.
- **`## Out of scope`** — often the most valuable section, and usually the emptiest in a source
  document. `none` is a valid answer; empty is not.
- **`## Open questions`** — the *missing* bucket **and every assumption**, phrased so the reader can
  confirm or correct it. Name who has to answer where you can tell.

The cross-cutting frontmatter — `feature_flag`, `e2e`, `ceilings` — will usually be unanswerable at
this stage. That is fine and it is the point: write `none` with an honest reason, or list it as an
open question. **Do not invent a value to make the file look complete.**

Set `status: draft`. It stays draft until a human says otherwise.

### 4. Stop at the gate

Present, in this order:

1. **What you assumed** — first, because it is what most needs correcting and it is what a reader
   skims past if it is at the bottom.
2. **What is missing** and who probably has to answer it.
3. Any **contradiction** you found between documents. Never resolve one silently; a contradiction in
   the requirements is a finding, not a problem to tidy up.
4. What you could not read.

Then stop. **Do not write contracts.** At this stage there is no stack, no paths and nothing real to
declare `writes` against, and a contract with invented paths is worse than no contract at all.
Decomposition comes after a human has approved the spec and a stack exists.

### 5. Suggest recording the decisions that already exist

If the reading surfaced a real decision — a stack, a hosting model, a data store, an integration that
has to be honoured — say that it belongs in an ADR. Those are cheapest to record now and are exactly
what gets relitigated in three months by someone who was not in the room. Offer; do not write ADRs
uninvited.

## Failure modes seen in the wild

| Symptom | Cause | Fix |
|---|---|---|
| The spec reads as agreed but nobody agreed | Assumptions written into `## Decisions` | The three buckets are not a formatting choice. When unsure, it is assumed |
| A `.docx` silently contributed nothing | It could not be read and that was not reported | Step 1 lists what was read, converted and skipped, every time |
| Two documents disagree and the spec picked one | The contradiction was tidied away | Report it. Choosing is the human's |
| Frontmatter fully populated on day one | Cross-cutting fields invented to look complete | `none` with a reason, or an open question |
| Contracts written straight from the spec | Skipped the human gate | The spec is `draft` until a person approves it |
