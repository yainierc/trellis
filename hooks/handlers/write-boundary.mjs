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
import { execFileSync } from 'node:child_process'
import { readEvent, allow, allowWithWarning, deny, escalate, guard } from '../../scripts/lib/hook.mjs'
import { loadProfile } from '../../scripts/lib/profile.mjs'
import { resolveActiveContract } from '../../scripts/lib/contract.mjs'
import { covers, within, toRepoPath } from '../../scripts/lib/paths.mjs'

// A person's role, from local git config. The same pattern the profile already uses for tracker
// identity: "resolved per developer, never hardcoded in a committed file".
function localRole (cwd) {
  try {
    return execFileSync('git', ['config', '--get', 'trellis.role'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim() || null
  } catch { return null }
}

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
  if (!active.writes.some(entry => covers(entry, repoPath))) {
    return deny(
      `${repoPath} is not in the \`writes\` list of ${active.id}.\n` +
      `Declared: ${active.writes.join(', ') || '(none)'}\n` +
      'A real problem found outside scope goes to a follow-up note and one line in the report. ' +
      'Scope is never widened mid-flight (rules/core.md §3).'
    )
  }

  // ── the per-agent area table ───────────────────────────────────────────────
  // "We know which areas Iver is going to be working on, Jess is going to be working on, which areas
  // our developer is going to be working on." The profile has carried that table since the first
  // commit and claimed the hook enforced it; it did not, which made it a note rather than a boundary.
  //
  // Whose area is this? The harness reports `agent_type` for a subagent. A human session carries
  // none, so a person identifies themselves the way the profile already asks developers to identify
  // themselves for the tracker: `git config trellis.role`, local and never committed. Unset means the
  // table does not apply to this session.
  const role = event.agent_type || localRole(cwd)
  const table = profile.agents
  if (role && table && Object.keys(table).length) {
    if (!(role in table)) {
      return deny(
        `role "${role}" is not listed in the profile's \`agents:\` table, and a role that is not ` +
        'listed writes nothing. Add it with the areas it owns, or work as a listed role.'
      )
    }
    const areas = table[role]
    // An empty list means "listed, no further restriction" — `implementer: []` is the template's own
    // default, and reading it as "nothing" would deny every write on the day the table is created.
    if (Array.isArray(areas) && areas.length && !areas.some(a => covers(a, repoPath))) {
      // ESCALATE, not deny. Crossing into another area is frequently legitimate — one person is often
      // both business and developer, and on a small team that is the normal case. What must not happen
      // is crossing without noticing. On a larger team the same prompt is the moment somebody says
      // "that is Jess's file" out loud.
      return escalate(
        `${repoPath} is inside ${active.id}'s \`writes\` but outside the areas "${role}" owns.\n` +
        `Owned by "${role}": ${areas.join(', ')}\n` +
        'Areas were allocated in planning so two people do not write the same files. Confirm if you ' +
        'know you are working outside yours; if somebody else owns this, it is theirs to change.'
      )
    }
  }

  return allow()
})
