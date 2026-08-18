# Spec — enforcement hooks

Status: approved · 2026-08-18

## Why

`rules/core.md` §2–§6 are currently tier 7 of the enforcement ladder: prose the model has to read and
remember. Every one of them can be expressed mechanically. Moving them to hooks is the single change
that turns Trellis from a document into a framework.

The measurement that settles the argument: the CLI reports plugin hooks as
`harness-only — no model context cost`. A rule enforced by a hook is both unforgettable **and**
free, while the same rule in `rules/core.md` is paid for in every session in the repo.

## The harness contract, verified

Verified against Claude Code `2.1.234` and the current hooks reference, not from memory.

- Plugin hooks live in `hooks/hooks.json` and are auto-discovered — nothing is declared in
  `plugin.json`, and nothing is written to `settings.json`.
- A handler receives the event as JSON on **stdin** and answers with JSON on **stdout**.
- `PreToolUse` denies a call with
  `hookSpecificOutput.permissionDecision: "deny"` plus `permissionDecisionReason`, exiting 0.
- **`Stop` has no decision field.** The only way to prevent a stop is exit 2, with the reason taken
  from stderr. A Stop gate written in the shape of a `PreToolUse` gate does nothing at all.
- `PostToolUse` cannot block: the tool already ran. It carries `additionalContext` only.
- The `if` field filters declaratively — `Bash(git push*)` handles `VAR=x git push`,
  `npm test && git push`, and the contents of `$(...)`. Command parsing in a handler is a fallback,
  not the mechanism.
- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` are substituted and exported.
- Tool events carry `agent_id` and `agent_type`, which is what makes the profile's `agents:` write
  table enforceable.

## Decisions

Taken as the industry-standard default where the choice was open, and recorded here so they are not
relitigated without a new decision.

### 1. Handlers are Node ESM with zero dependencies

Consistent with `scripts/validate-contract.mjs`, portable to Windows and WSL, and installable
without a package manager. Shell handlers are shorter and lose on all three.

### 2. Fail open outside a contract, fail closed inside one

A hook that cannot resolve an active contract **allows the call silently**. A hook that resolves one
enforces it strictly.

The failure mode this avoids is the one that kills guardrail tools in practice: a plugin that blocks
ordinary work in every repo it is installed in gets uninstalled within a week, and then it protects
nothing. Enforcement is scoped to the situation it was designed for — an executor working a contract
on a task branch.

A resolvable-but-broken context (a branch that names a contract that does not parse) is **not** the
fail-open case: it reports the breakage rather than passing silently.

### 3. The Stop gate records the failure; it never forces a retry

The naive Stop gate exits 2 to prevent the session closing on a red build. That contradicts
`core.md` §8 — *stop on failure, never auto-retry* — because preventing the stop is precisely how you
force a retry, and it risks trapping a session in a loop no human asked for.

Instead, on failure the gate:

1. re-runs every criterion itself, trusting no self-report (§5),
2. writes `status: blocked` into the contract file (the one field an orchestrator may write, §2),
3. surfaces the failing criteria to the human through `systemMessage`,
4. and **allows** the stop.

The executor cannot report a contract complete when it is not, because the contract file records the
truth regardless of what the summary said. A criterion that cannot be executed is reported
`NOT VERIFIED` and counts as a failure, never as a pass (§5).

## Which contract is active

A hook must answer this before it can enforce anything. Resolution order:

1. `TRELLIS_CONTRACT` in the environment — an explicit override.
2. `.trellis/active` — a one-line file naming the contract id.
3. **The git branch**, matched against the profile's `branch_pattern` (`task/{id}-{slug}`).

The branch is the primary mechanism because it cannot desynchronise: if you are on the branch, you
are in the contract. The other two exist for work that is not on a task branch yet.

## Out of scope

- Sandboxing. A shell can always evade a pattern; these hooks are defence in depth against drift,
  not a security boundary against an adversary.
- The `agents:` write table beyond passing `agent_type` through — the roles that would populate it do
  not exist yet.
- Any per-stack command. Everything stack-specific stays in the profile.
