// trellis — nested YAML subset reader, for `.trellis/profile.yml`.
//
// Not a YAML implementation and not trying to be. It reads exactly the shapes
// `templates/project-profile.yml` uses:
//
//   key: value            scalar          (`~` → null, `[]` → [], quoted strings unquoted)
//   key:                  nested mapping or block list, by indentation
//     sub: value
//     list:
//       - item
//
// Anything outside that subset throws with a line number rather than being silently misread. A
// config file that half-parses is worse than one that fails: the gate it configures then behaves in
// a way nobody wrote down.
//
// Note `none` stays the string "none". Throughout Trellis a declared `none` is a decision and an
// absent value is a gap, and collapsing it to null would erase that distinction.

export function parseYaml (text) {
  const lines = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const stripped = stripComment(raw)
    if (stripped.trim()) lines.push({ n: i + 1, indent: stripped.match(/^ */)[0].length, text: stripped.trim(), raw })
  })

  let pos = 0

  function parseBlock (indent) {
    // A block is either a list (all `- ` items) or a mapping. Peek to decide.
    if (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) {
      const list = []
      while (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) {
        list.push(scalar(lines[pos].text.slice(2).trim()))
        pos++
      }
      return list
    }

    const map = {}
    while (pos < lines.length && lines[pos].indent === indent) {
      const line = lines[pos]
      const kv = line.text.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
      if (!kv) throw new Error(`line ${line.n}: expected "key: value", got: ${line.text}`)
      const [, key, rest] = kv
      pos++
      if (rest !== '') { map[key] = scalar(rest); continue }

      // Empty value: a nested block if the next line is deeper, otherwise an empty mapping.
      if (pos < lines.length && lines[pos].indent > indent) map[key] = parseBlock(lines[pos].indent)
      else map[key] = {}
    }
    if (pos < lines.length && lines[pos].indent > indent) {
      throw new Error(`line ${lines[pos].n}: unexpected indentation`)
    }
    return map
  }

  if (!lines.length) return {}
  const result = parseBlock(lines[0].indent)
  if (pos < lines.length) throw new Error(`line ${lines[pos].n}: unexpected content at this indentation`)
  return result
}

// Strip a trailing `# comment`, but never inside a quoted value: `pattern: "a#b"` is a value.
function stripComment (line) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) { if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i)
  }
  return line
}

function scalar (v) {
  if (v === '~' || v === 'null') return null
  if (v === '[]') return []
  if (v === 'true') return true
  if (v === 'false') return false
  const inline = v.match(/^\[(.*)\]$/)
  if (inline) return inline[1].split(',').map(s => scalar(s.trim())).filter(s => s !== '')
  if (/^-?\d+$/.test(v)) return Number(v)
  return v.replace(/^["'](.*)["']$/, '$1')
}
