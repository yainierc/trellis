# Reference — what Trellis does, where it puts things, and what is not wired up yet

Written for two readers: a person deciding whether to trust it in their repository, and Claude
operating inside one. Both need the same thing — the map, not the argument. The argument is in
`README.md` and `docs/overview.html`.

Everything below was verified against the code, not recalled. Where something is declared and not
implemented, it says so.

---

## What it actually does

Four hooks the harness runs, five skills you invoke by asking, two agents, and nine scripts.

| Component | Fires when | Effect |
|---|---|---|
| **PreToolUse** `write-boundary` | any `Edit` · `Write` · `NotebookEdit` | **Denies** a write outside the active contract's `writes`, outside the repo root, or to the contract itself. **Asks the human** when the write is inside the contract but outside the area their role owns — crossing an area is often legitimate; crossing it unknowingly is not |
| **PreToolUse** `git-boundary` | a `git` or `gh` command | Denies force-push, push to the base branch and merging a PR by hand — always. Denies push, PR, merge, rebase and branch-switch while a contract is in flight, unless it was granted autonomy |
| **PostToolUse** `format-file` | after `Edit` · `Write` | Runs the profile's `format_file` and `lint_file` on the file just written. Cannot block — the tool already ran |
| **Stop** · **SubagentStop** | a session tries to close | Re-runs `build`, `lint`, `test_fast` and every `done_when` criterion. On failure, writes `status: blocked` and says so. **Never blocks the close** — see `docs/adr/…` and `core.md` §8 |

| Skill | Ask for it by saying |
|---|---|
| `init` | "adopt trellis here", "set up trellis" |
| `spec` | "write a spec from these documents" |
| `plan` | "split this spec", "who works on what" |
| `fleet` | "run the fleet", "launch the wave", "start these in parallel" |
| `contract` | "start a contract to…" |

| Agent | Role | Invoked with |
|---|---|---|
| `reviewer` | Adversarial review before a pull request. Reads artifacts, never the author's report | a contract and its diff |
| `implementer` | Executes one contract. Cannot edit it, cannot declare itself done | a contract path |

### Why some of these are skills and others are agents

The distinction is not seniority or size. It is one question:

> **Skill when the work needs to ask. Agent when the work must not see, or must not be seen.**

An agent runs as a subagent: its own context window, a reduced tool set, and an `agent_type` the
harness reports. What it cannot do is hold a conversation.

- **All four skills ask something.** `init` asks before overwriting a profile you tuned. `spec`
  asks which documents matter and puts its assumptions up for correction. `plan` asks who owns each
  area rather than guessing. `contract` asks how far it may carry itself, before the branch exists.
  A subagent would have to guess at exactly the point where guessing is the failure.
- **`reviewer` must not see.** `core.md` §5 requires that it never read the author's self-report. An
  isolated context is what guarantees it; as a skill it would read the conversation inevitably.
- **`implementer` must not be seen.** Two hundred tool calls nobody needs in the main session, and it
  needs an `agent_type` — which is the only condition under which the profile's per-role area table
  binds at all.

An `analyst` agent was written for this release and deleted before shipping, for the same rule: its
whole value is stopping to have assumptions corrected, and it cannot.

| Script | Does |
|---|---|
| `validate-contract.mjs <dir> --all` | Structure, enums, dependency cycles, dangling refs, `writes` overlaps |
| `validate-spec.mjs <dir> --all` | Structure, and refuses an approved spec with no `owner` |
| `parallel-matrix.mjs <dir> [--write]` | Derives `parallel_safe_with` from `writes` + the transitive dependency graph |
| `archive.mjs [--dry-run]` | Moves finished contracts and their specs out of the working set |
| `questions.mjs <spec> --for "<audience>"` | Prints one audience's open questions, ready to send |
| `fleet-plan.mjs <dir> [--record\|--wave]` | What may run right now, why the rest may not, and the recorded base commit |
| `digest.mjs [--since <ref>]` | What landed, under which contract, and what nobody could verify |
| `build-docs.mjs` | Wraps `docs/*.html` into standalone files under `docs/dist/` |
| `test-hooks.mjs` | The suite. 113 checks over throwaway fixture repositories, each one a real hook invocation |

---

## Where it stores things

**Nothing lives inside the plugin.** Every artefact belongs to the repository being governed, at the
paths that repository's own `.trellis/profile.yml` declares.

```
<your repo>/
├── .trellis/
│   ├── profile.yml          the opt-in. No profile ⇒ the plugin is inert here
│   ├── active               OPTIONAL, gitignored: one line naming the contract in flight,
│   │                        for repositories with no git. The branch does this otherwise
│   ├── wave.json            gitignored. The base commit a wave branched from, and its contracts.
│   │                        §7 requires it recorded; recorded means verifiable, not committed
│   └── worktrees/           gitignored. One per contract in a wave, all from that base commit
├── docs/
│   ├── specs/               what to build. `_`-prefixed folders are skipped
│   │   └── archive/<year>/   specs whose whole wave finished
│   ├── contracts/           units of work
│   │   └── archive/<year>/   finished contracts. Still resolvable by `depends_on`
│   ├── adr/                 decision records. Never archived — superseded instead (§9)
│   └── runbooks/            created by `init`. NOTHING IN THE PLUGIN USES IT (see below)
└── tmp/                     gitignored scratch. Never referenced from a committed file
```

`init` creates the directories the profile points at, each with a `.gitkeep`. It does not create
anything the profile does not name.

### Everything the plugin writes to your disk

Exhaustively — four things, and no others:

1. **A contract's `status:` line.** One line, never the body, so a gate cannot quietly amend the
   criteria it just failed (`core.md` §2). Written by the Stop gate on failure.
2. **A contract's `parallel_safe_with:` line**, and only when you run `parallel-matrix.mjs --write`.
3. **File moves**, when you run `archive.mjs` without `--dry-run`. It moves; it never deletes.
4. **`docs/dist/*.html`**, when you run `build-docs.mjs`.

The hooks themselves write nothing. They answer allow or deny.

---

## What arms it

Two conditions, both required, and **silence is the normal state**:

1. the repository has `.trellis/profile.yml`
2. the current branch matches `git.branch_pattern` — or `.trellis/active` names a contract, for
   repositories with no git

Outside those, every hook returns "no opinion". That is deliberate: a guardrail that blocks ordinary
work in every repository it is installed in gets uninstalled, and then it protects nothing.

Three answers, not two: **deny** for a boundary of safety, **ask** for a boundary of ownership, and
silence for everything else. An area is owned, not dangerous — so crossing one prompts rather than
refuses.

**Guards fail open. Exceptions fail closed.** A hook that cannot resolve a contract allows the call.
Graduated autonomy inverts that: if a precondition cannot be *verified*, the answer is no.

---

## Profile fields the code actually reads

| Field | Read by |
|---|---|
| `project.autonomy` | the autonomy resolver — the repo's ceiling |
| `paths.specs` · `paths.contracts` · `paths.archive` | the validators, `archive.mjs`, `digest.mjs` |
| `git.base_branch` · `git.branch_pattern` | the git boundary, contract resolution |
| `git.deploy_on_merge` | the autonomy resolver. Unanswered is a refusal |
| `commands.build` · `test_fast` · `lint` | the Stop gate |
| `commands.format_file` · `lint_file` | the PostToolUse hook |
| `gates.stop` | the Stop gate, which gates run |
| `concurrency.max_parallel` · `ceilings` | `fleet-plan.mjs` — the wave size, and the ceiling warning |
| `git.worktree_root` | `/trellis:fleet` — one worktree per contract |
| `agents` | the write boundary, per-role areas. Binds a subagent by `agent_type`, a person by `git config trellis.role` |

### Declared and not wired up

Honesty is cheaper than a surprise. These are in the template and **nothing reads them**:

| Field | Intended for | State |
|---|---|---|
| `paths.runbooks` | operational procedures | Location convention only. No template, no validator |
| `paths.decisions` | ADRs | Convention. `archive.mjs` deliberately does not touch ADRs |
| `git.pr_target` | landing a whole spec as one PR | Nothing opens PRs yet |

| `commands.format_check` · `typecheck` | extra gates | Not in `gates.stop`'s vocabulary |

| `tracker.*` (ADO) | work items | Designed on day one, never implemented |
| `rules.packs` · `rules.local` | layered rule packs | Convention only |
| `gates.pre_pr` | review, slow tests | The reviewer agent exists; nothing invokes it automatically |
| `gates.domain_review` | who reviews by area | Advisory by design — it records, it does not enforce |

A field here is not broken. It is a place to write something down that no machine checks yet, and
that is worth knowing before you rely on one.

---

## What it does not do

- **It is not a sandbox.** A determined shell evades a pattern. These are defence in depth against
  drift, not containment of an adversary.
- **It never merges or deploys.** Autonomy at most lets a contract ask the platform to merge if the
  required status checks pass.
- **It does not decide.** It refuses to detect whether a change needs a feature flag, an end-to-end
  test, or autonomy. Those are judgements a human grants, once, per spec or per contract.
- **It has no orchestrator.** Nothing picks up a contract, runs a wave, or invokes the reviewer or
  the implementer on its own. Every skill and every agent is invoked by a person asking for it — and
  the human gate between analysis and execution is the reason, not an omission.
- **It has never been measured.** No eval suite exists. Every rule traces to a real failure in a real
  repository, and none of them to a number.

---

## The one thing to remember

A rule is enforced at the earliest tier that can express it, and the CLI prices the difference:
plugin hooks are reported as *harness-only — no model context cost*, while a rule in `rules/core.md`
is paid for in every session in the repository. **Moving a rule down a tier makes it both
unforgettable and free.** Everything else here is a consequence of that.
