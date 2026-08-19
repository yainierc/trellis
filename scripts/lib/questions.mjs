// trellis — one reader for a spec's open questions.
//
// Two callers need the same parse: `questions.mjs` prints an audience's questions as markdown, and
// `publish-questions.mjs` renders them as a page. Two parsers of one format drift, and the drift is
// invisible until the page and the printout disagree about what was asked — so the parse lives here
// once and neither caller has its own.
//
// The shape it reads is fixed by templates/SPEC.md:
//
//   ### <who answers>
//
//   **Q-01 · <one plain sentence anyone can answer>**
//
//   <context>
//
//   - **If nobody answers:** <what ships in the silence>
//   - **Detail:** <the technical framing>
//
// Everything is optional except the audience heading and the bold question line, because a spec being
// written is allowed to be half-finished. What is missing is reported by validate-spec.mjs, not here —
// this file reads, and a reader that refuses to read an incomplete document is useless during drafting.

import { readFileSync } from 'node:fs'
import { parseFrontmatter, section } from './frontmatter.mjs'

const QUESTION_LINE = /^\*\*(.+?·.+?)\*\*\s*$/gm

const field = (body, label) => {
  const m = body.match(new RegExp(`^-\\s+\\*\\*${label}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n-\\s+\\*\\*|\\n*$)`, 'm'))
  return m ? m[1].trim().replace(/\s*\n\s*/g, ' ') : null
}

// One question block: the bold line, the prose under it, and the two labelled bullets.
function parseQuestion (heading, body) {
  const sep = body.search(/^-\s+\*\*/m)
  const context = (sep === -1 ? body : body.slice(0, sep)).trim()
  const bullets = sep === -1 ? '' : body.slice(sep)
  const [, id = null, title = heading] = heading.match(/^(\S+)\s*·\s*(.+)$/) || []
  return {
    id,
    title: title.trim(),
    heading: heading.trim(),
    context,
    // "If nobody answers" is the line that makes silence expensive rather than merely open.
    ifNobodyAnswers: field(bullets, 'If nobody answers'),
    detail: field(bullets, 'Detail'),
    answered: /^\*\*Answered\b/m.test(body)
  }
}

function parseGroup (audience, body) {
  const parts = body.split(QUESTION_LINE)
  const questions = []
  for (let i = 1; i < parts.length; i += 2) {
    questions.push(parseQuestion(parts[i], (parts[i + 1] || '').trim()))
  }
  return { audience: audience.trim(), body: body.trim(), questions }
}

// Reads the file and returns everything both callers need. `groups` is empty when the section exists
// but nobody has been named — a distinct state from the section being absent, and the callers say so
// differently.
export function readSpec (file) {
  const text = readFileSync(file, 'utf8')
  const fm = parseFrontmatter(text)
  if (fm.error) return { error: fm.error }

  const oq = section(fm.body, '## Open questions')
  if (!oq) return { error: 'no "## Open questions" section' }

  const parts = oq.split(/^###\s+(.+?)\s*$/gm)
  const groups = []
  for (let i = 1; i < parts.length; i += 2) groups.push(parseGroup(parts[i], (parts[i + 1] || '')))

  return {
    data: fm.data,
    body: fm.body,
    groups,
    // Context for a reader who has never seen the spec. Deliberately only these two: everything else
    // in a spec is a decision already taken, and publishing those invites them to be reopened.
    why: (section(fm.body, '## Why') || '').trim(),
    outcome: (section(fm.body, '## Outcome') || '').trim()
  }
}

export const matchAudience = (groups, wanted) =>
  groups.filter(g => g.audience.toLowerCase().includes(String(wanted).toLowerCase()))
