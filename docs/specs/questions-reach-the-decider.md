---
id: questions-reach-the-decider
title: Questions reach the decider where they already are, and the answer comes back on the record
status: draft
owner: Yainier Caraballo
date: 2026-08-19
supersedes: none

contracts:
  - ASK-T-02
  - ASK-T-03

feature_flag: none
flag_reason: >-
  Nothing to switch. Whether the page can be published is not a configured choice but an observed
  fact about the session, and it is detected at the moment of use rather than declared in advance.
flag_default: ~
flag_retire_by: ~
flag_retired_by: ~

e2e: none
e2e_reason: >-
  The only verification that means anything is one real APN spec published, read by a decision-maker
  who was not asked to learn anything new, and answered in a comment that comes back. That is a
  manual check with a named owner, not a suite.
e2e_owner: Yainier Caraballo

ceilings: none
---

# questions-reach-the-decider — Questions reach the decider where they already are, and the answer comes back on the record

## Why

`scripts/questions.mjs` was built to give a spec's questions an address. It stops one step short of
the address:

> *"It prints. It never sends, never edits, and never writes into a spec."*

So the decision-maker still receives a block of markdown from somebody who went and got it for them.
The executives who own half these answers work in Claude — that is where the ideas were cooked and it
is the only tool in this chain they already use. Asking them to read markdown pasted into a chat is
asking them to come to us.

**This reopens a refusal, and that has to be argued rather than skipped.**
`docs/specs/questions-have-an-address.md` put it out of scope in two lines:

> *"Sending anything anywhere. The script prints; a human pastes. No mail, no Slack, no tracker."*
> *"Translating an answer back into the spec."*

and refused a business-facing document per audience because *"two copies of one decision drift, and
nothing tells you which one the reader used."*

That reasoning was correct and it still is. Two things about the context changed:

1. **This repository already accepts exactly one kind of second copy.** `docs/reference.html` is
   generated from `REFERENCE.md`, marked as generated, and never edited. One source, one derived
   view, and the derived view says so on its face. That is the shape a published page has to take —
   not a document somebody maintains.
2. **A published page carries comment threads that can be read back.** Mail, Slack and a tracker were
   refused because the answer lands somewhere the spec never sees; the answer dies in an inbox. A
   comment on a generated page is attached to the question it answers, and can be collected.

The refusal was about channels that lose the answer. This is a channel that returns it.

## Outcome

One audience's open questions can be published as a private page in the decision-maker's own tool,
generated from the spec and never edited by hand. Re-publishing updates the same page, so a person
who has it open is looking at the current questions and not a link that quietly went stale.

Where publishing is not available, the same command prints — and **says which of the two it did.**

Answers arrive as comments. Claude collects them and drafts each one into the spec in the format
already in use, and a human lands it. The spec never changes underneath a running contract.

## Decisions

| Decision | Position | Where |
|---|---|---|
| The page is **generated**, never edited | Same discipline as `docs/reference.html`, and the page states it. A page somebody edits is a second source of truth, which is what the parent spec refused | here |
| Where the URL lives | `.trellis/published.json`, **not the spec's frontmatter.** `questions.mjs` established that a tool does not write into a spec, and §2 exists so a spec cannot shift under a running contract. A published URL is session bookkeeping, not part of the requirement | here |
| Storing the URL is not optional | Without it every publish mints a new link and the decision-maker comments on an abandoned page. This is the single detail that decides whether the feature works | here |
| No profile setting for "may publish" | Detected, not declared. A config field would be one more thing declared and unenforced — the failure this plugin has already found four times (`tracker.*`, `agents:`, `concurrency.*`) | here |
| Publishing is never silent | The skill reports the path it took and where the page is. Telling a colleague their executives have the questions when the tool was denied is the same lie on disk we refuse everywhere else | here |
| What goes on the page | That audience's questions, plus the spec's `Why` and `Outcome` as read-only context. Not the whole spec — publishing settled decisions invites them to be relitigated by the one reader least equipped to judge them | here |
| A skill, not a hook | A hook is a Node process and cannot publish. And publishing is outward-facing: it needs the model to render and a human to have asked for it | here |

**Considered and refused — mail, Slack, a tracker integration.** Still refused, for the parent spec's
original reason: the answer lands where the spec cannot see it.

**Considered and refused — making the page a form the decision-maker fills in.** It would be more
convenient and it would make the page authoritative. Then two documents hold the same decision and the
one that drifts is the one nobody diffs. Comments are the right shape precisely because they are
attached to a question and are not the answer of record until somebody lands them.

**Considered and refused — publishing automatically when a spec is approved.** Publishing is
outward-facing and irreversible in the way that matters: the page exists, it can be shared onward, and
it may be indexed. It happens because a person asked.

## Feature flag

`feature_flag: none` — see the frontmatter.

## Cross-cutting verification

`e2e: none` in the automated sense. The verification is manual and owned: one real APN spec published,
opened by a decision-maker with no instructions, answered in a comment, collected back. If that round
trip does not happen once, the feature does not work no matter what the fixtures say.

## The wave

| Contract | Delivers | Depends on |
|---|---|---|
| `ASK-T-02` | The outbound leg: the `ask` skill, the generated page, the stored URL, the degrade path and its honest report | — |
| `ASK-T-03` | The return leg: collect comments, draft each answer in the existing `**Answered <date> — <name>:**` form, and stop for a human | `ASK-T-02`, and **Q-02** |

## Out of scope

- A status dashboard for executives. Different problem, and one whose failure mode is a page nobody
  reads that everybody believes.
- Publishing contracts, ADRs or anything below the spec line. Those readers have a repository.
- Deciding *when* a question has gone unanswered too long. §10 territory; not this increment.
- Any change to how the write boundary or the Stop gate behave. This is entirely above the contract
  line.

## Open questions

### Yainier Caraballo

**Q-01 · Who may publish an audience's questions — anyone running Trellis, or only the spec's `owner`?**

A page arriving in an executive's tool carries implied authority. Today any developer with the plugin
could send one.

- **If nobody answers:** anyone may publish, and the page names the spec's `owner` as the person
  accountable for the questions — so a page sent by a developer does not read as the owner's ask.
- **Detail:** owner-only is one comparison against the frontmatter. The reason not to default to it is
  that a role is a valid owner, and nothing can check whether the person running the command holds it.

**Q-02 · When a decision-maker answers in a comment, may that answer land in the spec without the owner confirming it?**

The format already exists and is already in use: `**Answered 2026-08-19 — Yainier Caraballo:** …`.
The question is whether Claude writes it or proposes it.

- **If nobody answers:** it is proposed, never written. Claude drafts the amendment and stops; a human
  lands it. Safe, and slower.
- **Detail:** this is the only thing blocking `ASK-T-03`. `ASK-T-02` does not depend on it. Answering
  it "Claude writes it" would let a comment on a web page change a requirement while a contract runs
  against it, which is what §2 exists to prevent — so the default is the safe one on purpose.
