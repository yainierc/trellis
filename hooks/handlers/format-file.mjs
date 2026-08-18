#!/usr/bin/env node
// trellis — per-file format and lint, on the file that was just written.
//
// PostToolUse cannot block: the tool already ran. What it can do is close the loop immediately, so
// a formatting or lint problem is fixed in the same turn it was introduced instead of surfacing in
// CI twenty minutes later.
//
// Both commands come from the profile and receive the file path as their last argument. A repo that
// declares `~` for either gets nothing — silently, because this is a convenience and not a gate.

import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { readEvent, allow, report, guard } from '../../scripts/lib/hook.mjs'
import { loadProfile, command } from '../../scripts/lib/profile.mjs'
import { within, toRepoPath } from '../../scripts/lib/paths.mjs'

guard(async () => {
  const event = await readEvent()
  const input = event.tool_input || {}
  const target = input.file_path || input.notebook_path || input.path
  if (!target) return allow()

  const cwd = event.cwd || process.cwd()
  let loaded
  try { loaded = loadProfile(cwd) } catch { return allow() }
  if (!loaded) return allow()

  const { root, profile } = loaded
  const abs = resolve(cwd, target)
  if (!within(root, abs)) return allow()

  const notes = []
  for (const name of ['format_file', 'lint_file']) {
    const cmd = command(profile, name)
    if (!cmd) continue
    try {
      execSync(`${cmd} ${JSON.stringify(abs)}`, {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000
      })
    } catch (err) {
      const out = `${err.stdout || ''}${err.stderr || ''}`.trim().split('\n').slice(-10).join('\n')
      notes.push(`${name} failed on ${toRepoPath(root, abs)}:\n${out || err.message}`)
    }
  }

  if (!notes.length) return allow()
  return report({ context: `trellis:\n${notes.join('\n\n')}` })
})
