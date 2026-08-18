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

### 1. Establish where you are allowed to look

Before opening anything, settle the search root. Use what the user named — a folder, a handful of
files, "these documents". **If they did not name one, ask.** Do not default to the whole repository:
a scan that wanders is slow, expensive, and pulls in things nobody meant as requirements.

Search that root **including its subdirectories** — requirements are almost never flat, and the
annex three folders down is usually where the awkward constraint lives. Skip:

| Skip | Why |
|---|---|
| `.git/`, `node_modules/`, `vendor/`, `dist/`, `build/`, `.venv/` | Machinery, not requirements |
| `.trellis/worktrees/`, the profile's `paths.scratch` | Working state, gitignored by design |
| **The profile's `paths.specs`, `paths.contracts` and `paths.decisions`** | **These are your own output** |
| Images, binaries, archives | Nothing to read as text |

That third row is the one that bites. A repository where this skill has already run has a
`docs/specs/` full of exactly the kind of prose a naive scan reads as requirements — and a spec built
partly from a previous spec **launders yesterday's assumptions into today's decisions**, where
nothing downstream can tell them apart from something the client actually wrote. Source documents
come from outside this loop. Treat a prior spec as *context you may consult*, never as a source, and
say so if you use one.

### 2. List what you found before you read any of it

Show the candidate list — path, format, rough size — and say which you will read, which need
conversion, and which you cannot open at all.

**Above roughly a dozen documents, or when several look irrelevant, stop and ask** rather than
reading everything. A spec built on four of thirty documents is fine; one that silently chose those
four is not. Never sample without saying so.

Then, per format:

| Format | How |
|---|---|
| `.pdf` | Read it directly. Long documents come in page ranges; read all of them, do not sample |
| `.md`, `.txt` | Read directly |
| `.docx` | **Cannot be read directly.** On macOS: `textutil -convert txt -stdout <file>`. `pandoc -t plain <file>` where available |
| `.xlsx`, `.csv` | Requirements matrices live here more often than anyone admits. `.csv` reads directly; for `.xlsx` ask for a CSV export rather than guessing |
| anything else | **Report it as unread.** Never infer content from a filename |

A `.pdf` that is a scan has no text layer — you will get pages of image. Say so; a scanned annex you
could not actually read is a gap in the spec, not a document you covered.

### 3. Read everything before writing anything

Requirements contradict each other across documents, and the contradiction is usually the most
important thing on the page. You cannot see it having read one file.

While reading, keep the three buckets explicitly:

- **Decided** — the source says it, in words you could quote.
- **Assumed** — you concluded it. Anything you filled in because it seemed obvious belongs here, and
  the reader must be able to see every one of these at a glance.
- **Missing** — the source does not answer it, and someone has to.

When you are unsure whether something is decided or assumed, **it is assumed.** That rule costs a
question; the opposite costs the project.

### 4. Fill the template

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

### 5. Stop at the gate

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

### 6. Suggest recording the decisions that already exist

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
| The spec agrees suspiciously well with an earlier one | A previous spec in `docs/specs/` was scanned as a source | The output paths are excluded. A prior spec is context, never a requirement |
| The scan took minutes and read a licence file | No search root was established, so it walked the repo | Step 1: ask for the root, exclude machinery |
| An annex in a subfolder was never opened | The search was not recursive | Recursion is on by default; the exclusions are what bound it |
| Thirty documents, four read, nobody told | Sampled silently | Step 2: above a dozen, show the list and ask |
