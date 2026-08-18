#!/usr/bin/env node
// trellis — wrap the documentation fragments into standalone HTML files.
//
// `docs/*.html` are written as page *fragments*: no doctype, no <html>, no <body>. That is what the
// Artifact viewer expects, and it wraps them itself. Opened straight from disk they mostly render,
// but with no <meta charset> a browser guesses the encoding and the em dashes, arrows and accented
// text in these documents come out as mojibake.
//
// This produces `docs/dist/*.html`: the same content, self-contained, safe to email or drop on a
// share. One source, two outputs — the fragment stays the thing that gets edited.
//
//   node scripts/build-docs.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, 'docs')
const OUT = join(SRC, 'dist')

const wrap = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`

mkdirSync(OUT, { recursive: true })

const pages = readdirSync(SRC).filter(f => f.endsWith('.html'))
if (!pages.length) { console.error('no .html sources in docs/'); process.exit(1) }

for (const file of pages) {
  const src = readFileSync(join(SRC, file), 'utf8')
  if (/<!doctype/i.test(src)) { console.log(`- ${file} — already standalone, skipped`); continue }
  const title = src.match(/<title>([^<]*)<\/title>/i)?.[1] ?? basename(file, '.html')
  // The <title> moves into the head we build; leaving the original in the body is harmless but
  // duplicates it in the DOM, so drop it.
  const body = src.replace(/<title>[^<]*<\/title>\s*/i, '')
  const out = join(OUT, file)
  writeFileSync(out, wrap(title, body))
  console.log(`✓ ${file} → docs/dist/${file}  (${(wrap(title, body).length / 1024).toFixed(1)} KB, "${title}")`)
}
