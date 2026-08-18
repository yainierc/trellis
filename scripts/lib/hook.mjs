// trellis — the harness hook vocabulary.
//
// Verified against Claude Code 2.1.234 and the hooks reference:
//
//   · the event arrives as JSON on stdin; the answer is JSON on stdout, exit 0
//   · PreToolUse denies with hookSpecificOutput.permissionDecision = "deny"
//   · Stop has NO decision field — exit 2 is the only way to prevent a stop, and this framework
//     deliberately never uses it (see docs/specs/enforcement-hooks.md, decision 3)
//   · PostToolUse cannot block; the tool already ran
//
// Every helper here exits the process. A hook that falls off the end of its script without printing
// anything is read as "no opinion", which is the right default but a bad accident.

export async function readEvent () {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function emit (payload) {
  process.stdout.write(JSON.stringify(payload))
  process.exit(0)
}

// No opinion. The ordinary outcome: most calls in most sessions are none of Trellis's business.
export const allow = () => emit({})

// Let the call through but tell the human something. Used when the context is broken rather than
// absent — a branch naming a contract that does not parse must not pass silently.
export const allowWithWarning = message => emit({ systemMessage: `trellis: ${message}` })

// Block a tool call, with the reason the model will see.
export const deny = reason => emit({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: `trellis: ${reason}`
  }
})

// PostToolUse / Stop: feed something back without blocking anything.
export const report = ({ context, message }) => emit({
  ...(context ? { additionalContext: context } : {}),
  ...(message ? { systemMessage: message } : {})
})

// A handler that throws must not take the tool call down with it. An enforcement bug should degrade
// to "no opinion" plus a visible note, never to a wedged session.
export function guard (main) {
  main().catch(err => {
    process.stdout.write(JSON.stringify({ systemMessage: `trellis hook error: ${err.message}` }))
    process.exit(0)
  })
}
