---
name: ask
description: Send one audience their open questions from a spec, as a page they can read and comment on in their own tool, or as markdown when publishing is unavailable. Use when the user says "send these questions to the executives", "ask business", "publish the open questions", or asks how to get a spec's questions in front of whoever answers them.
---

# Put the questions in front of whoever answers them

The people who own half of a spec's questions do not work in a repository. They will not clone one,
and markdown pasted into a chat asks them to come to us. This puts their questions where they already
are — and, just as importantly, gives their answer somewhere to land.

Two things this must never do, because both are worse than not running at all:

- **Claim to have published a page that does not exist.** If publishing is unavailable or refused,
  say so in those words and hand over the markdown. A colleague who believes their executives have the
  questions will wait for an answer that is never coming.
- **Publish a new page when one already exists for that audience.** The URL is stored for exactly this
  reason. A second page means the person holding the first one is commenting where nothing reads.

## 1. Find the audience

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/questions.mjs" <spec.md> --list
```

This prints each audience and how many questions it carries. **One page addresses one audience.** If
the user has not said which, ask — do not merge two audiences into one page, because a page addressed
to everybody is a page nobody owns.

If a spec has no audiences, its questions are not grouped yet. That is the `spec` skill's job, not a
reason to publish something shapeless.

## 2. Render the page

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-questions.mjs" <spec.md> --for "<audience>"
```

It writes `.trellis/pages/<spec-id>--<audience>.html` and prints what you need:

| Line | Use it for |
|---|---|
| `page` | the file to publish |
| `title` | the artifact title — keep it stable across republishes, it is how they find the tab |
| `existing` | **a URL, or `none`.** This decides the next step |
| `record` | the exact command to run afterwards |

Read the warnings. A question with no stated default, or a spec with no owner, is worth telling the
user about before the page reaches a decision-maker — the page shows both honestly rather than hiding
them, which is not the same as them being fine.

## 3. Publish it — and only because the user asked

Publishing is outward-facing. The page becomes a link that can be forwarded, so it happens when a
person asks for it, never as a helpful extra step at the end of something else.

Use the **Artifact** tool with the rendered file:

- **`existing` was `none`** — publish normally. Pass a one-sentence `description` and a `favicon`.
- **`existing` was a URL** — pass that URL as the `url` parameter. This updates the page in place, so
  the reader's link, their tab and their comment threads all survive. Skipping this is the single
  worst thing that can go wrong here.

Then record it, always:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/publish-questions.mjs" <spec.md> --for "<audience>" --record <url>
```

**If you did not record the URL, you did not finish.** Nothing else stores it, and the next publish
will strand this one.

## 4. If publishing is not available

It may not be, and that is a normal outcome rather than an error: a session can be authenticated in a
way that has nowhere to host a page, an organisation can deny the tool outright, and either way the
answer is the same.

Do not retry, and do not work around it. Fall back:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/questions.mjs" <spec.md> --for "<audience>"
```

Hand the user that markdown, and tell them plainly: **the page was not published, here are the
questions, somebody has to carry them.** Name why if you know it. The rendered file is still on disk
and can be opened locally or sent as a file.

## 5. Report what actually happened

State, in this order:

1. **Which of the two paths you took** — published, or printed because publishing was unavailable.
2. The URL, if there is one, and whether it was **updated or newly created**.
3. How many questions, for which audience, and any warning from step 2.
4. That answers come back as **comments on the page**, and that they land on the spec by hand — with
   a name and a date — rather than automatically. A comment is not the record; the spec is.

## What this skill does not do

- **It does not collect the answers.** Reading comments back and drafting them into the spec is
  `ASK-T-03`, and it is deliberately not built yet: whether an answer may land without the owner
  confirming it is an open question on the spec, and building it would be answering it.
- **It does not edit the spec.** Not the questions, not an answer, not the URL. §2 exists so a spec
  cannot shift under a contract already running against it, and a comment on a web page is exactly
  the kind of thing that must not move a requirement on its own.
- **It does not publish anything below the spec line.** Contracts, ADRs and plans have a reader who
  has a repository.
