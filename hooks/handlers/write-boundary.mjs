#!/usr/bin/env node
// trellis — write boundary. Enforces rules/core.md §3 and §2 at tier 3 of the enforcement ladder.
//
//   §3  An executor writes only inside its worktree and inside its contract's `writes` list.
//       Not a config file "while I'm here", not a neighbouring fix, not the shared index.
//   §2  An executor never edits the contract it is being graded against.
//
// Fails open when no contract resolves: a guardrail that blocks ordinary work in every repo it is
// installed in gets uninstalled, and then it protects nothing.

import { resolve } from 'node:path'
import { readEvent, allow, allowWithWarning, deny, guard } from '../../scripts/lib/hook.mjs'
import { loadProfile } from '../../scripts/lib/profile.mjs'
import { resolveActiveContract } from '../../scripts/lib/contract.mjs'
import { covers, within, toRepoPath } from '../../scripts/lib/paths.mjs'

guard(async () => {
  const event = await readEvent()
  const input = event.tool_input || {}
  const target = input.file_path || input.notebook_path || input.path
  if (!target) return allow()

  const cwd = event.cwd || process.cwd()
  let loaded
  try { loaded = loadProfile(cwd) } catch (err) { return allowWithWarning(err.message) }
  if (!loaded) return allow()                                  // repo is not governed by trellis

  const { root, profile } = loaded
  const active = resolveActiveContract({ root, profile, cwd })
  if (!active) return allow()                                  // no contract in flight
  if (active.broken) return allowWithWarning(`${active.reason} — the write boundary is NOT being enforced`)

  const abs = resolve(cwd, target)

  // §2 — the contract is immutable during execution.
  if (resolve(active.file) === abs) {
    return deny(
      `${active.id} is the contract you are executing. An executor never edits its own writes, ` +
      'constraints or done_when — a wrong contract is amended by a human in a separate commit ' +
      'before code is written (rules/core.md §2).'
    )
  }

  // §3, first half — stay inside the worktree.
  if (!within(root, abs)) {
    return deny(`${target} is outside the worktree root ${root}. An executor writes only inside its own worktree (rules/core.md §3).`)
  }

  // §3, second half — stay inside the declared writes.
  const repoPath = toRepoPath(root, abs)
  if (active.writes.some(entry => covers(entry, repoPath))) return allow()

  return deny(
    `${repoPath} is not in the \`writes\` list of ${active.id}.\n` +
    `Declared: ${active.writes.join(', ') || '(none)'}\n` +
    'A real problem found outside scope goes to a follow-up note and one line in the report. ' +
    'Scope is never widened mid-flight (rules/core.md §3).'
  )
})
