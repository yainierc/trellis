// trellis — contract frontmatter reader.
//
// Deliberately a subset of YAML: scalars, inline arrays, block lists. Two sequences break a YAML
// scalar silently — ": " turns it into a mapping and " #" starts a comment that swallows the rest of
// the line. We strip the comment form and reject the other, so a damaged entry fails loudly here
// instead of quietly stopping being the rule that was written.
//
// Shared by the validator and by every hook that has to read a contract. One copy: two parsers that
// disagree about what a contract says is the defect this file exists to prevent.

export const unquote = s => s.replace(/^["'](.*)["']$/, '$1')

export function parseFrontmatter (text) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { error: 'file does not start with a --- frontmatter block' }
  const end = lines.indexOf('---', 1)
  if (end === -1) return { error: 'frontmatter block is not closed' }

  const data = {}
  let currentList = null
  for (let i = 1; i < end; i++) {
    let line = lines[i].replace(/\s+#.*$/, '')       // strip trailing comment
    if (!line.trim() || /^\s*#/.test(line)) continue // whole-line comment

    const item = line.match(/^\s+-\s+(.*)$/)
    if (item && currentList) { data[currentList].push(unquote(item[1])); continue }

    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) return { error: `line ${i + 1} is neither a key nor a list item: ${lines[i].trim()}` }
    const [, key, raw] = kv
    currentList = null
    const value = raw.trim()

    // Block scalars: `>` folds newlines into spaces, `|` keeps them; a trailing `-` strips the final
    // newline. Specs use them constantly — a `flag_reason` is a sentence, not a token — while
    // contracts never did, which is why a reader that could not read one looked finished for months.
    // Read from the ORIGINAL line, not the comment-stripped copy: inside a block scalar a `#` is text.
    const block = value.match(/^([|>])([-+]?)$/)
    if (block) {
      const [, style] = block
      const body = []
      const indent = (lines[i + 1] || '').match(/^\s*/)[0].length
      while (i + 1 < end && (lines[i + 1].trim() === '' || (lines[i + 1].match(/^\s*/)[0].length >= indent && indent > 0))) {
        body.push(lines[++i].slice(indent))
      }
      while (body.length && body[body.length - 1].trim() === '') body.pop()
      data[key] = style === '|'
        ? body.join('\n')
        : body.reduce((acc, l) => (l.trim() === '' ? acc + '\n' : acc ? acc + ' ' + l.trim() : l.trim()), '')
      continue
    }
    if (value === '') { data[key] = []; currentList = key; continue }
    if (value === '[]') { data[key] = []; continue }
    const inline = value.match(/^\[(.*)\]$/)
    if (inline) {
      data[key] = inline[1].split(',').map(s => unquote(s.trim())).filter(Boolean)
      continue
    }
    data[key] = value === '~' ? null : unquote(value)
  }
  return { data, body: lines.slice(end + 1).join('\n') }
}

// JS RegExp has no \Z, so a "next heading or end of input" lookahead cannot be written directly:
// cut the tail at the next heading instead. Getting this wrong silently skips the LAST section of
// every file, which is exactly where `## Out of scope` lives.
export function section (body, heading) {
  const m = body.match(new RegExp(`^${heading}\\s*$([\\s\\S]*)`, 'm'))
  if (!m) return null
  const next = m[1].search(/^## /m)
  return next === -1 ? m[1] : m[1].slice(0, next)
}

// The `## Done when` checklist, one entry per criterion.
//
// `command` is the first backticked span on the line, which is what the orchestrator re-executes.
// A criterion with no command is returned with `command: null` — the caller reports it NOT VERIFIED
// rather than treating it as a pass. See rules/core.md §5.
export function doneWhenCriteria (body) {
  const text = section(body, '## Done when')
  if (!text) return []
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const item = line.match(/^\s*-\s*\[[ xX]\]\s*(.+?)\s*$/)
    if (!item) continue
    const raw = item[1]
    const cmd = raw.match(/`([^`]+)`/)
    out.push({ raw, command: cmd ? cmd[1] : null })
  }
  return out
}
