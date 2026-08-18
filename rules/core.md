# Core rules

The non-negotiables of the framework itself. Stack-independent. Every one of these was earned by a
real failure in a real repository.

## 1. The unit of work is a contract

No implementation work happens without a **contract file** (`templates/CONTRACT.md`) whose
frontmatter declares, at minimum: `id`, `status`, `executor`, `agent`, `estimate`, `depends_on`,
`parallel_safe_with`, `reads`, `writes`, and a body carrying `## Objective`, `## Constraints`,
`## Steps`, `## Done when` and `## Out of scope`.

- **`writes` is the scheduling primitive.** Two contracts conflict when their `writes` sets overlap
  and neither lists the other in `parallel_safe_with`. Overlap is **prefix-aware by path segment**:
  `src/App/` overlaps `src/App/Foo.cs`; `src/App.Api/` does **not** overlap `src/App/`.
- **`parallel_safe_with` is an author's assertion, not a proof.** A detected `writes` overlap always
  wins over it.
- A `writes` entry naming a bare directory makes its contract conflict with everything under that
  directory. Narrow it to files, or state explicitly that the directory is the unit of change.
- `done_when` criteria are **runnable commands** wherever a command can express them. A criterion
  that cannot be executed as written is a defect in the contract, not a step to skip.
- **A criterion this contract cannot satisfy on its own is equally a defect.** End-to-end and other
  cross-cutting checks belong to the wave, not to one contract — a frontend contract and a backend
  contract each deliver half of a flow, so an E2E criterion on either of them can only fail until
  the other lands, or be relaxed until it passes. Both outcomes are worse than not writing it. See
  §7 and `docs/adr/0001-e2e-belongs-to-the-wave.md`.

Exception: trivial mechanical work — a typo, a rename, a broken build — may proceed without a
contract, and **must be reported as such**.

## 2. The contract is immutable during execution

An executor never edits its own `writes`, `constraints`, `done_when` or `depends_on`. Amending the
contract you are graded against is a categorical defect, not a shortcut. A wrong contract is fixed
by the human, in a separate commit, before code is written.

The orchestrator may only ever write `status`, the execution log, and the generated index.

## 3. The write boundary

An executor writes only:
1. inside its own worktree, and
2. inside its contract's `writes` list.

Nothing else. Not a config file "while I'm here", not a neighbouring fix, not the shared index. A
real problem found outside scope goes to a follow-up note and one line in the report — **scope is
never widened mid-flight**.

## 4. Human gates

These are never resolved by an agent, in any circumstance, however green the build:

- `git push` to a protected branch, opening or merging a PR, any deploy.
- Any change to a shared contract other code depends on: a port interface, a shared host/bootstrap,
  a published schema.
- Anything that weakens an isolation or security control.
- A contradiction between the contract and the code as-built.
- A decision whose wrong answer means throwing the work away.

An executor that reaches a gate **stops and asks**. Waiting costs nothing; guessing costs the task.

## 5. The orchestrator does not trust the report

Every `done_when` criterion is re-executed by the orchestrator, not read off the executor's summary.

- Anything that cannot be run is reported **NOT VERIFIED** — never "passed".
- **Before declaring a criterion failed, verify the command that measured it.** A false failure
  sends correct work back to be redone, which costs more than a false pass. Widen the scope of the
  check and read what it actually matched.
- The reviewer that grades a deliverable never reads the author's self-report or conversation. Only
  artifacts and their sources count as evidence.

## 6. Report faithfully

A red build reported as done is worse than a reported failure. If a step was skipped, say so and
say what was run instead. Never infer progress that has not been observed: a silent executor is not
a healthy executor, and process liveness is not a completion signal.

## 7. Isolation

Parallel work runs one worktree per contract, every worktree branched from the **same** base
commit, recorded. Integration happens only after the whole wave is green — partial integration
leaves the tree in a hybrid state when a late contract fails.

Executors commit in their worktree. They do not push, do not open PRs, do not merge, do not switch
branches, and do not rebase.

## 8. Stop on failure — never auto-retry

A failed criterion marks the contract `blocked` and hands the decision to the human: retry with a
refinement, abandon, or pause. Dependent contracts do not start. The orchestrator never picks one
of those options itself.

## 9. Locked decisions are facts, not opinions

A decision recorded in an ADR is not relitigated without a new ADR. A mechanism that was
**considered and refused** is recorded as refused with its reason — that record is the only thing
stopping it from being re-proposed as a fresh idea.

An accepted decision may still owe evidence. **Accepted is not validated.**

## 10. Decay signals — check these periodically

The framework is degrading if any of these is true. They are leading indicators; treat one as a
reason to pause feature work and repair the loop.

- A contract reported complete left the build or tests broken → the `done_when` set is insufficient.
- One session discovered a convention and the next ignored it → the learning loop is broken.
- Two contracts declared `parallel_safe_with` each other and collided at merge → `writes` is
  under-declared; widen it, do not loosen the check.
- A rule is being restated in prompts because it keeps being violated → it belongs lower on the
  enforcement ladder.
- Memory and rule files only ever grow → nothing is being pruned, and the context cost is rising
  for every session in the repo.
- A human is re-reviewing the same class of defect every week → that defect class needs a gate, not
  more review.

## 11. Incidents are institutional memory

When a real failure costs real time, its symptom, cause and fix go into the failure-mode table of
the skill that let it happen — with the date. That table is what stops the next session from
tripping the same wire, and it is never trimmed for tidiness.
