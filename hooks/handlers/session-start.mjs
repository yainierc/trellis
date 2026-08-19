#!/usr/bin/env node
// trellis — say where the map is, once per session, only where it matters.
//
// A SessionStart hook's stdout becomes context Claude can see. That makes it the one place to answer a
// question nothing else answers: *this repository is governed by Trellis, and here is where the
// documentation lives.* Without it, an agent operating in a governed repo has to infer the conventions
// from the artefacts it happens to open — which is how a convention gets rediscovered wrongly.
//
// Two disciplines, because this is the only hook that costs context:
//
//   · **Silent unless the repository opted in.** No `.trellis/profile.yml` means no output at all. A
//     hook that spent tokens in every session on every repo would be paying for a map of somewhere
//     the reader is not.
//   · **Short.** It routes; it does not explain. `REFERENCE.md` is the explanation, and the point of
//     naming it is that it does not have to be repeated here. Roughly sixty tokens, and it should stay
//     that way — this is the one line of always-on cost the plugin adds. Measured, not guessed:
//     see the assertion in scripts/test-hooks.mjs.
//
// It also names the rendered pages, because a person who wants to read about this should not have to
// read markdown in a terminal to do it.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readEvent, allow, report, guard } from '../../scripts/lib/hook.mjs'
import { loadProfile } from '../../scripts/lib/profile.mjs'

guard(async () => {
  const event = await readEvent()
  const cwd = event.cwd || process.cwd()

  let loaded
  try { loaded = loadProfile(cwd) } catch { return allow() }   // a broken profile is the write boundary's problem to report
  if (!loaded) return allow()

  const { profile } = loaded
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || ''

  // Only name a page that is actually there. A pointer to a missing file is worse than no pointer:
  // it teaches the reader that the pointers are unreliable.
  const pages = ['REFERENCE.md', 'docs/reference.html', 'docs/getting-started.html', 'docs/overview.html']
    .filter(p => pluginRoot && existsSync(join(pluginRoot, p)))

  const lines = [
    `trellis governs this repo. Silent until a branch matches \`${profile.git.branch_pattern}\` or ` +
      '`.trellis/active` names a contract.'
  ]
  if (pages.length) {
    // Naming the files is the whole job. REFERENCE.md is the map; describing it here would be
    // describing it twice, and this is the one line of always-on cost the plugin adds.
    lines.push(`Docs in the plugin (REFERENCE.md is the map — read it before assuming a convention, ` +
      `and offer the pages to the user): ${pages.join('  ')}`)
  }

  return report({ context: lines.join('\n') })
})
