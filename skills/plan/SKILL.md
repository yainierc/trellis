---
name: plan
description: Split an approved spec into the set of contracts several people work through in parallel, allocating write areas per person so nobody collides. Use when the user says "plan this spec", "break this into sessions", "split the work", "who works on what", or is about to start work that more than one person will touch at the same time.
---

# Split a spec into the work several people can do at once

One contract is one person's next few hours. A spec is usually several people's week. This is the step
between them, and it is where collisions are prevented — after the work starts, a collision is a merge
conflict at best and two people overwriting each other at worst.

Requires an **approved** spec. If it is still `draft`, say so and stop: splitting a spec whose open
questions are unanswered produces contracts against a moving target, and `core.md` §2 protects a
contract whose parent does not protect it.

## Steps

### 1. Refuse to re-split

List the contracts path for anything whose `spec:` names this spec. **If any exist, stop and report
them.** Never overwrite a decomposition — somebody may have edited it by hand, and a split is cheap to
redo deliberately and expensive to lose silently.

### 2. Read the spec and everything it names

The spec, every ADR in its `## Decisions`, and the rules the work will touch. Then read enough of the
repository to know what the paths actually are — you are about to declare write boundaries, and a
boundary invented from the spec's prose will deny something the work genuinely needs on day one.

### 3. Slice by deliverable, not by layer

Cut where a slice can ship and be verified on its own.

- **One coherent touch set per contract.** Two contracts whose paths overlap cannot run at the same
  time, so a slice that reaches into three areas serialises everything around it.
- **Bias to fewer, larger contracts.** Every split must earn itself: real parallelism, a different
  specialist, isolating a risk, or a session that would otherwise run past about three hours.
  Over-decomposition costs more in handoffs than it saves in parallelism.
- **Do not slice by technical layer** — "the API contract", "the frontend contract" — unless each half
  is independently shippable. Otherwise you have created a dependency chain and called it parallelism.
- Anything cross-cutting stays on the spec, not in a slice. See `core.md` §12.

### 4. Ask who owns each area. Do not guess.

**Who works on what is a management decision made in a planning meeting**, and a tool that assigns it
produces an allocation nobody agreed to and everybody unpicks.

So: present the slices with their paths and **ask**. If the profile's `agents:` table is filled in,
propose from it and say you are proposing.

Then record the allocation where it binds. The profile's `agents:` table is enforced by the write
boundary for subagents — a role writing outside its areas is denied, with the areas named in the
refusal.

### 5. Derive the parallelism. Never write it by hand.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/parallel-matrix.mjs" <contracts path> --write
```

`core.md` §1: *"`parallel_safe_with` is an author's assertion, not a proof."* This removes the
assertion. Two contracts are safe together only when their `writes` are disjoint **and** neither is a
transitive ancestor of the other — and the transitive part is what a person gets wrong: A and B with
disjoint paths, where A depends on C and C depends on B, are not parallel-safe.

Run it without `--write` first and read the output. A `⚠ CLAIMED BUT UNSAFE` line means somebody
asserted two contracts could run together and they cannot; that is the case this exists to catch.

### 6. Validate the set, then report the gaps

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-contract.mjs" <contracts path> --all
```

`--all` is the point here: dependency cycles, references to contracts that do not exist, and write
overlaps between contracts that claim to be parallel.

Then report, and lead with **what the spec references that does not exist** — a named ADR that was
never written, a decision the spec assumes was made, a path that is not there yet. Those are the
things that stop work on day two, and they are cheapest to see now.

Close with the wave: each contract, its owner, its paths, what it depends on, and what may run beside
it. Update the spec's `contracts:` list and its `## The wave` table.

### 7. Stop

Do not start any of them. `/trellis:contract` picks one up, asks its autonomy question, and branches.

## Failure modes seen in the wild

| Symptom | Cause | Fix |
|---|---|---|
| Everything runs one at a time | Slices overlap, so nothing is parallel-safe | Cut by deliverable, not by layer. Check the derived matrix — an empty one means the slicing failed |
| Two people overwrote each other | `parallel_safe_with` was written by hand and was wrong | Derive it. That is step 5 and it is not optional |
| A "parallel" pair collided anyway | Only direct dependency edges were checked | The relation is transitive. The script handles it; a person will not |
| Work stopped on day two waiting for a decision | The spec named an ADR that does not exist and nobody looked | Step 6 leads with gaps for this reason |
| An allocation nobody agreed to | The split assigned people | Ask. It is a planning decision, not a derivation |
| A re-split lost hand-edited contracts | No idempotency guard | Step 1 |
