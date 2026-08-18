// trellis — repository profile discovery and loading.
//
// The plugin is generic; everything repo-specific lives in `.trellis/profile.yml`. If a hook needs
// a value that is not in here, the profile is missing a field — that is the bug, and editing the
// plugin is not the fix.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseYaml } from './yaml.mjs'

export const PROFILE_PATH = join('.trellis', 'profile.yml')

// Walk up from `from` looking for a repository that Trellis governs. A `.git` directory alone is
// not enough: an un-profiled repo is one the plugin must stay out of.
export function findRepoRoot (from) {
  let dir = resolve(from || process.cwd())
  for (;;) {
    if (existsSync(join(dir, PROFILE_PATH))) return dir
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

const DEFAULTS = {
  paths: { specs: 'docs/specs', contracts: 'docs/contracts', archive: 'docs/contracts/archive', decisions: 'docs/adr', scratch: 'tmp' },
  git: { base_branch: 'main', branch_pattern: 'task/{id}-{slug}', worktree_root: '.trellis/worktrees' },
  commands: {},
  gates: { stop: ['build', 'lint', 'test_fast', 'done_when'] },
  agents: {}
}

// Returns { root, profile } or null when this directory is not governed by Trellis.
// A profile that exists but does not parse throws: that is a broken context, not an absent one, and
// silently falling back to defaults would apply gates nobody configured.
export function loadProfile (from) {
  const root = findRepoRoot(from)
  if (!root) return null
  const file = join(root, PROFILE_PATH)
  let parsed
  try {
    parsed = parseYaml(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`${PROFILE_PATH} could not be read: ${err.message}`)
  }
  return { root, file, profile: merge(DEFAULTS, parsed) }
}

function merge (base, over) {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v
  }
  return out
}

// A command from the profile, or null when the repo declared `~` for it.
//
// `~` means "not applicable in this repo" and the gate that would use it is skipped **while saying
// so**. The caller must report the skip; it must never drop it silently.
export function command (profile, name) {
  const v = profile?.commands?.[name]
  return v === null || v === undefined || v === '' ? null : String(v)
}
