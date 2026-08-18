// trellis — how far a contract may carry itself.
//
// Two levels:
//
//   supervised   the executor commits in its worktree and stops. The default, and what core.md §4
//                describes without qualification.
//   autonomous   the executor may push its task branch, open a pull request, and request auto-merge.
//                It still never merges: `gh pr merge --auto` states an intent that GitHub's required
//                status checks either carry out or do not. See docs/adr/0003-graduated-autonomy.md.
//
// The effective level is min(repo ceiling, contract grant), and every precondition below must hold.
//
// ── the inversion that matters ───────────────────────────────────────────────
// Guards fail OPEN: a hook that cannot work out which contract is in flight allows the call, because
// blocking ordinary work is how a guardrail gets uninstalled.
//
// An exception fails CLOSED. Autonomy is an exception. If a precondition cannot be *verified* — no
// remote, `gh` missing, the API call times out — the answer is `supervised`, not "probably fine".
// Granting an exception on an unread signal is the failure this file exists to prevent.

import { execFileSync } from 'node:child_process'

const GH_TIMEOUT_MS = 8000

export const LEVELS = ['supervised', 'autonomous']

// Returns { level, reasons } — `reasons` explains every refusal, in the order they were checked, so
// a denial message can say which precondition failed rather than "not allowed".
export function resolveAutonomy ({ root, profile, contract, cwd }) {
  const reasons = []
  const deny = reason => { reasons.push(reason); return { level: 'supervised', reasons } }

  // 1 · the repository's ceiling
  if (profile?.project?.autonomy !== 'auto-merge') {
    return deny(`the repo profile declares autonomy: ${profile?.project?.autonomy ?? 'pr'} — auto-merge is not permitted here`)
  }

  // 2 · the grant on this contract, answered by a human before the branch existed
  const granted = contract?.data?.autonomy
  if (granted !== 'autonomous') {
    return deny(`${contract?.id ?? 'this contract'} was not granted autonomy (autonomy: ${granted ?? 'supervised'})`)
  }

  // 3 · does a merge deploy? An unanswered question is a refusal, never an assumption.
  const deploys = profile?.git?.deploy_on_merge
  if (deploys === true) {
    return deny('git.deploy_on_merge is true — auto-merge would be auto-deploy, which this mechanism does not cover')
  }
  if (deploys !== false) {
    return deny('git.deploy_on_merge is unanswered in the profile — state true or false; it is not inferred')
  }

  // 4 · the platform must actually be able to refuse the merge
  const protection = baseBranchProtection({ cwd: cwd || root, base: profile.git.base_branch })
  if (!protection.ok) return deny(protection.reason)

  return { level: 'autonomous', reasons }
}

// Is the base branch protected by at least one required status check?
//
// Without that, `gh pr merge --auto` merges immediately: auto-merge waits for required checks, and a
// branch with none has nothing to wait for. The whole safety argument rests on this call, so it is
// made live at the moment of the push rather than trusted from when autonomy was granted —
// protection can be removed in between.
export function baseBranchProtection ({ cwd, base }) {
  const slug = repoSlug(cwd)
  if (!slug) return { ok: false, reason: 'no GitHub remote could be resolved — autonomy needs a platform that can refuse a merge' }

  let raw
  try {
    raw = execFileSync('gh', ['api', `repos/${slug}/branches/${base}/protection`], {
      cwd, encoding: 'utf8', timeout: GH_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (err) {
    const msg = String(err.stderr || err.message || '')
    if (/not protected/i.test(msg)) {
      return { ok: false, reason: `${base} has no branch protection — auto-merge would merge with nothing to wait for` }
    }
    if (/ENOENT/.test(msg) || err.code === 'ENOENT') {
      return { ok: false, reason: 'the gh CLI is not available, so branch protection could not be verified' }
    }
    return { ok: false, reason: `branch protection on ${base} could not be verified (${firstLine(msg)})` }
  }

  let data
  try { data = JSON.parse(raw) } catch { return { ok: false, reason: 'branch protection response could not be read' } }

  const checks = data?.required_status_checks?.contexts ?? data?.required_status_checks?.checks ?? []
  if (!Array.isArray(checks) || checks.length === 0) {
    return { ok: false, reason: `${base} is protected but requires no status checks — there is nothing for auto-merge to wait for` }
  }
  return { ok: true, checks }
}

// owner/repo from the origin remote. Only GitHub is supported: auto-merge is a GitHub mechanism, and
// pretending otherwise would grant autonomy on a platform that cannot enforce it.
export function repoSlug (cwd) {
  let url
  try {
    url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch { return null }
  const m = url.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

const firstLine = s => String(s).split('\n').find(Boolean)?.slice(0, 120) ?? 'unknown error'
