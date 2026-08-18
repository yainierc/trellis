#!/usr/bin/env node
// trellis — git boundary. Enforces rules/core.md §4 and §7.
//
//   §4  push to a protected branch, opening or merging a PR, and any deploy are human gates,
//       never resolved by an agent however green the build is.
//   §7  executors commit in their worktree. They do not push, do not open PRs, do not merge,
//       do not switch branches, and do not rebase.
//
// Two tiers, deliberately:
//
//   ALWAYS       pushing to the base branch, force-pushing, merging a PR by hand. These are
//                destructive and shared; nothing an agent is doing justifies them.
//   IN CONTRACT  every other push, PR, merge, rebase and branch switch. Blocking these outside a
//                contract would break the human's own session, which is how guardrails get removed.
//   AUTONOMOUS   a contract a human granted autonomy to, in a repo that permits it, on a base branch
//                the platform can actually defend, may push its task branch, open a pull request and
//                request auto-merge. It still never merges: `gh pr merge --auto` asks GitHub to merge
//                if its required checks pass. A bare `gh pr merge` stays denied at every level.
//                See docs/adr/0003-graduated-autonomy.md.
//
// The `if` field in hooks.json already narrows this to git and gh commands, and already handles
// `VAR=x git push`, `a && git push` and `$(...)` contents. The handler classifies only to choose
// the right message.

import { readEvent, allow, allowWithWarning, deny, guard } from '../../scripts/lib/hook.mjs'
import { loadProfile } from '../../scripts/lib/profile.mjs'
import { resolveActiveContract, currentBranch } from '../../scripts/lib/contract.mjs'
import { resolveAutonomy } from '../../scripts/lib/autonomy.mjs'

// Split a shell line into the pieces that each run a program. Crude on purpose: this is defence in
// depth against drift, not a sandbox — a determined shell always wins, and the spec says so.
const segments = cmd => String(cmd)
  .split(/\$\(|\)|`|&&|\|\||[;\n|]/)
  .map(s => s.trim().replace(/^(?:[A-Za-z_][\w]*=\S*\s+)+/, ''))
  .filter(Boolean)

guard(async () => {
  const event = await readEvent()
  const command = event.tool_input?.command
  if (!command) return allow()

  const cwd = event.cwd || process.cwd()
  let loaded
  try { loaded = loadProfile(cwd) } catch (err) { return allowWithWarning(err.message) }
  if (!loaded) return allow()

  const { root, profile } = loaded
  const base = profile.git.base_branch
  const parts = segments(command)

  // ── always denied ─────────────────────────────────────────────────────────
  for (const s of parts) {
    if (/^git\s+push\b/.test(s) && /(--force|-f\b|--force-with-lease)/.test(s)) {
      return deny('force-pushing is never an agent decision (rules/core.md §4).')
    }
    if (/^git\s+push\b/.test(s)) {
      const onBase = currentBranch(cwd) === base
      const namesBase = new RegExp(`\\b${base}\\b`).test(s.replace(/^git\s+push\s+/, ''))
      const bare = /^git\s+push\s*$/.test(s)
      if (namesBase || (bare && onBase)) {
        return deny(`pushing to ${base} is a human gate. Waiting costs nothing; guessing costs the task (rules/core.md §4).`)
      }
    }
    if (/^gh\s+repo\s+delete\b/.test(s)) {
      return deny('deleting a repository is never an agent decision (rules/core.md §4).')
    }
    // Merging by hand is always the human's. `--auto` is different in kind: it does not merge, it
    // asks the platform to merge if its required checks pass, and it is decided further down.
    if (/^gh\s+pr\s+merge\b/.test(s) && !/--auto\b/.test(s)) {
      return deny('merging a pull request is a human gate. `gh pr merge --auto` delegates the decision to required status checks; a bare merge does not (rules/core.md §4).')
    }
  }

  // ── denied while a contract is in flight ──────────────────────────────────
  const active = resolveActiveContract({ root, profile, cwd })
  if (!active) return allow()
  if (active.broken) return allowWithWarning(`${active.reason} — the git boundary is NOT being enforced`)

  // Only the three commands autonomy can relax are worth asking about. Resolving it involves a live
  // branch-protection call, and paying that on every `git status` under a contract would make the
  // hook the slowest thing in the session.
  const RELAXABLE = [/^git\s+push\b/, /^gh\s+pr\s+(create|ready)\b/, /^gh\s+pr\s+merge\b.*--auto\b/]
  const asksForRelaxation = parts.some(s => RELAXABLE.some(re => re.test(s)))

  // How far did a human allow this contract to go? Refused reasons are surfaced verbatim: "not
  // allowed" sends someone hunting, "main has no branch protection" tells them what to fix.
  const { level, reasons } = asksForRelaxation
    ? resolveAutonomy({ root, profile, contract: active, cwd })
    : { level: 'supervised', reasons: [] }

  if (level === 'autonomous') {
    for (const s of parts) {
      // Requesting auto-merge is the whole point of the grant.
      if (/^gh\s+pr\s+merge\b/.test(s) && /--auto\b/.test(s)) return allow()
      if (/^gh\s+pr\s+(create|ready)\b/.test(s)) return allow()
      // Pushing the task branch is allowed; pushing the base branch never was and still is not —
      // the always-denied tier above has already rejected that case.
      if (/^git\s+push\b/.test(s)) return allow()
    }
  }

  const refused = reasons.length ? `\nAutonomy was not granted: ${reasons[0]}.` : ''

  const RULES = [
    [/^git\s+push\b/, 'push'],
    [/^gh\s+pr\s+(create|merge|ready)\b/, 'open or merge a pull request'],
    [/^git\s+merge\b/, 'merge'],
    [/^git\s+rebase\b/, 'rebase'],
    [/^git\s+(checkout|switch)\s+(?!-{1,2}\s*$)(?!.*--\s)[^-]/, 'switch branches'],
    [/^git\s+reset\s+--hard\b/, 'hard-reset the tree']
  ]
  for (const s of parts) {
    for (const [re, what] of RULES) {
      if (re.test(s)) {
        return deny(
          `${active.id} is in flight: an executor does not ${what}. It commits in its worktree and ` +
          'stops there — integration happens only after the whole wave is green (rules/core.md §7).' +
          refused
        )
      }
    }
  }

  return allow()
})
