#!/usr/bin/env node
// trellis — the Stop gate. Enforces rules/core.md §5, §6 and §8.
//
//   §5  The orchestrator does not trust the report: every done_when criterion is re-executed here,
//       not read off the executor's summary. Anything that cannot be run is NOT VERIFIED, never
//       "passed".
//   §6  Report faithfully. A red build reported as done is worse than a reported failure.
//   §8  Stop on failure — never auto-retry.
//
// This gate NEVER exits 2.
//
// Exit 2 is the only way to prevent a stop, and preventing the stop is precisely how you force a
// retry — which §8 forbids and which can trap a session in a loop nobody asked for. So on failure
// the gate re-runs the criteria itself, writes `status: blocked` into the contract, surfaces the
// failing criteria to the human, and lets the session close. The executor cannot report a contract
// complete when it is not, because the file records the truth regardless of what the summary said.

import { execSync } from 'node:child_process'
import { readEvent, allow, allowWithWarning, report, guard } from '../../scripts/lib/hook.mjs'
import { loadProfile, command } from '../../scripts/lib/profile.mjs'
import { resolveActiveContract, setStatus } from '../../scripts/lib/contract.mjs'

const TIMEOUT_MS = 10 * 60 * 1000

function run (cmd, cwd) {
  try {
    execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: TIMEOUT_MS })
    return { ok: true }
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`.trim()
    return { ok: false, output: out.split('\n').slice(-12).join('\n') || err.message }
  }
}

guard(async () => {
  const event = await readEvent()
  const cwd = event.cwd || process.cwd()

  let loaded
  try { loaded = loadProfile(cwd) } catch (err) { return allowWithWarning(err.message) }
  if (!loaded) return allow()

  const { root, profile } = loaded
  const active = resolveActiveContract({ root, profile, cwd })
  if (!active) return allow()
  if (active.broken) return allowWithWarning(`${active.reason} — the Stop gate did NOT run`)
  if (active.data.status !== 'active') return allow()   // nothing in flight to gate

  const results = []
  for (const gate of profile.gates.stop || []) {
    if (gate === 'done_when') {
      if (!active.criteria.length) {
        results.push({ name: 'done_when', state: 'NOT VERIFIED', detail: 'the contract declares no criteria' })
        continue
      }
      for (const c of active.criteria) {
        if (!c.command) {
          // §5 — a criterion that cannot be executed is a defect in the contract, not a pass.
          results.push({ name: c.raw, state: 'NOT VERIFIED', detail: 'no runnable command in the criterion' })
          continue
        }
        const r = run(c.command, root)
        results.push({ name: c.command, state: r.ok ? 'pass' : 'FAIL', detail: r.output })
      }
      continue
    }

    const cmd = command(profile, gate)
    if (!cmd) {
      // A `~` in the profile means "not applicable here" — skipped while saying so, never silently.
      results.push({ name: gate, state: 'skipped', detail: 'declared `~` in .trellis/profile.yml' })
      continue
    }
    const r = run(cmd, root)
    results.push({ name: `${gate}: ${cmd}`, state: r.ok ? 'pass' : 'FAIL', detail: r.output })
  }

  const bad = results.filter(r => r.state === 'FAIL' || r.state === 'NOT VERIFIED')
  const lines = results.map(r => `  ${pad(r.state)} ${r.name}${r.detail && r.state !== 'pass' ? `\n      ${r.detail.replace(/\n/g, '\n      ')}` : ''}`)

  if (!bad.length) {
    return report({
      context: `trellis Stop gate — ${active.id}: every criterion re-executed and passed.\n${lines.join('\n')}`,
      message: `trellis: ${active.id} passed the Stop gate (${results.length} checks re-executed).`
    })
  }

  // §8 — hand the decision to the human. Retry with a refinement, abandon, or pause: the gate never
  // picks one of those itself, and dependent contracts do not start.
  setStatus(active.file, 'blocked')
  return report({
    context:
      `trellis Stop gate — ${active.id} is now \`blocked\`. Do NOT report this contract as complete.\n` +
      `${bad.length} of ${results.length} checks did not pass:\n${lines.join('\n')}\n` +
      'Report what was run and what failed. The decision to retry, abandon or pause is the human\'s.',
    message:
      `trellis: ${active.id} FAILED the Stop gate and was marked \`blocked\`.\n` +
      bad.map(r => `  ${r.state}  ${r.name}`).join('\n')
  })
})

const pad = s => (s + '        ').slice(0, 12)
