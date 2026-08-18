// trellis — active contract resolution.
//
// Every hook has to answer one question before it can enforce anything: *which contract is this?*
// Resolution order, fixed in docs/specs/enforcement-hooks.md:
//
//   1. TRELLIS_CONTRACT in the environment      explicit override
//   2. .trellis/active                          a one-line file naming the contract id
//   3. the git branch, via profile.git.branch_pattern
//
// The branch is primary because it cannot desynchronise: if you are on the branch, you are in the
// contract. The other two exist for work not yet on a task branch.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter, doneWhenCriteria } from './frontmatter.mjs'

// Statuses a hook enforces against. A completed or withdrawn contract governs nothing.
const LIVE = ['pending', 'active', 'blocked', 'gated']

export function currentBranch (cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch { return null }
}

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Does this branch name belong to this contract id?
//
// Note it takes the id rather than extracting one. `task/{id}-{slug}` is ambiguous the moment an id
// contains a dash — `task/FIX-T-01-thing` splits just as happily into id `FIX` with slug
// `T-01-thing`. Guessing picks the wrong contract silently, which is the worst possible failure for
// a write boundary. So the id is never inferred: every known contract is tested against the branch,
// and only a real one can match.
export function branchMatchesId (pattern, id, branch) {
  const src = String(pattern)
    .split(/(\{id\}|\{slug\})/)
    .map(p => (p === '{id}' ? escapeRe(id) : p === '{slug}' ? '.*' : escapeRe(p)))
    .join('')
  return new RegExp('^' + src + '$').test(branch)
}

// An id stated outright, by an explicit override rather than by the branch. Null means "ask the
// branch", which is the ordinary path.
export function declaredContractId ({ root }) {
  if (process.env.TRELLIS_CONTRACT) return process.env.TRELLIS_CONTRACT.trim()
  const marker = join(root, '.trellis', 'active')
  if (existsSync(marker)) {
    const id = readFileSync(marker, 'utf8').trim()
    if (id) return id
  }
  return null
}

function contractFiles (dir) {
  const out = []
  if (!existsSync(dir)) return out
  ;(function walk (p) {
    const st = statSync(p)
    if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e)); return }
    if (p.endsWith('.md')) out.push(p)
  })(dir)
  return out
}

// Returns:
//   null                              nothing to enforce — fail open, silently
//   { broken: true, reason }          a context that exists but does not work — report it
//   { id, file, data, body, writes, criteria }
//
// The distinction matters: "no contract" is the ordinary case in an ordinary session, while "the
// branch names a contract that does not parse" is a defect the human needs to see.
export function resolveActiveContract ({ root, profile, cwd }) {
  const declared = declaredContractId({ root })
  const branch = declared ? null : currentBranch(cwd || root)
  if (!declared && !branch) return null

  // A branch that cannot belong to any contract — `main`, `spike/whatever` — is the ordinary case,
  // not a broken one. Only a branch shaped like the pattern is expected to name a contract.
  const looksLikeTask = branch !== null &&
    new RegExp('^' + String(profile.git.branch_pattern)
      .split(/(\{id\}|\{slug\})/)
      .map(p => (p === '{id}' || p === '{slug}' ? '.+' : escapeRe(p)))
      .join('') + '$').test(branch)
  if (!declared && !looksLikeTask) return null

  const dir = join(root, profile.paths.contracts)
  for (const file of contractFiles(dir)) {
    const fm = parseFrontmatter(readFileSync(file, 'utf8'))
    if (fm.error || !fm.data?.id) continue
    const hit = declared
      ? fm.data.id === declared
      : branchMatchesId(profile.git.branch_pattern, fm.data.id, branch)
    if (!hit) continue
    if (!LIVE.includes(fm.data.status)) return null
    return {
      id: fm.data.id,
      file,
      data: fm.data,
      body: fm.body,
      writes: Array.isArray(fm.data.writes) ? fm.data.writes : [],
      criteria: doneWhenCriteria(fm.body)
    }
  }

  const what = declared ? `id "${declared}"` : `a contract for branch "${branch}"`
  return { broken: true, reason: `found no ${what} under ${profile.paths.contracts}` }
}

// Rewrite the `status:` line in place.
//
// core.md §2: the orchestrator may only ever write `status`, the execution log and the generated
// index. This touches exactly one line and never the body, so a gate cannot quietly amend the
// criteria it just failed.
export function setStatus (file, status) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const end = lines.indexOf('---', 1)
  for (let i = 1; i < end; i++) {
    if (/^status:\s/.test(lines[i])) {
      lines[i] = lines[i].replace(/^(status:\s*)\S+/, `$1${status}`)
      writeFileSync(file, lines.join('\n'))
      return true
    }
  }
  return false
}
