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

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
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

// ── markdown → the same page the hand-written docs use ──────────────────────
// REFERENCE.md is the normative copy, and Claude reads it as markdown. A human wants the same content
// in the same shape as the other two pages — so it is RENDERED, never maintained twice. Two copies of
// one document is the divergence this plugin refuses everywhere else.
//
// A deliberate subset: headings, tables, fenced and inline code, bold, italic, links, lists,
// blockquotes and rules. That is everything REFERENCE.md uses. Anything else passes through as text
// rather than being silently mangled.
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Code spans are lifted out before emphasis runs and put back after. Without that, an asterisk INSIDE
// a code span — `docs/dist/*.html` is the one that caught this — is read as emphasis, and the
// surrounding `**bold**` stops matching because its content is no longer asterisk-free.
function inline (t) {
  const spans = []
  let out = esc(t).replace(/`([^`]+)`/g, (_, c) => `\u0000${spans.push(c) - 1}\u0000`)
  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${spans[Number(i)]}</code>`)
}

function renderMarkdown (md) {
  const out = []
  const lines = md.split(/\r?\n/)
  let i = 0
  const flushTable = rows => {
    if (rows.length < 2) { for (const r of rows) out.push(`<p>${inline(r)}</p>`); return }
    const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    const head = cells(rows[0])
    out.push('<div class="tbl"><table><thead><tr>' +
      head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>')
    for (const r of rows.slice(2)) {
      out.push('<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>')
    }
    out.push('</tbody></table></div>')
  }
  while (i < lines.length) {
    const l = lines[i]
    if (/^```/.test(l)) {
      const body = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++])
      i++
      out.push(`<pre>${esc(body.join('\n'))}</pre>`)
      continue
    }
    if (/^\s*$/.test(l)) { i++; continue }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue }
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) { const n = h[1].length; out.push(`<h${n} id="${h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}">${inline(h[2])}</h${n}>`); i++; continue }
    if (/^\|/.test(l)) {
      const rows = []
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++])
      flushTable(rows)
      continue
    }
    if (/^>\s?/.test(l)) {
      const body = []
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${inline(body.join(' '))}</blockquote>`)
      continue
    }
    const bullet = /^\s*[-*]\s+/
    const numbered = /^\s*\d+\.\s+/
    if (bullet.test(l) || numbered.test(l)) {
      const marker = bullet.test(l) ? bullet : numbered
      const tag = marker === bullet ? 'ul' : 'ol'
      const items = []
      while (i < lines.length && (marker.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (marker.test(lines[i])) items.push(lines[i].replace(marker, ''))
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim()
        else break
        i++
      }
      out.push(`<${tag}>` + items.map(t => `<li>${inline(t)}</li>`).join('') + `</${tag}>`)
      continue
    }
    // Always consume the current line first. A guard that can reject the line we arrived on — a
    // paragraph opening with inline code, for instance — leaves the index where it was and spins
    // forever. Progress is not something to leave to the shape of the input.
    const para = [lines[i++]]
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(```|\||>|#{1,4}\s)/.test(lines[i]) && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) para.push(lines[i++])
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }
  return out.join('\n')
}

mkdirSync(OUT, { recursive: true })

// ── REFERENCE.md → docs/reference.html ──────────────────────────────────────
// A reference is scanned, not read: dense tables, anchored headings, code that stands out. Same
// palette and faces as the other two pages, and the same three theme states, so it reads as one set.
const REFERENCE_CSS = `<style>
  :root{--paper:#F2F4F1;--surface:#FFF;--surface-2:#E9EDE8;--ink:#141F1C;--ink-2:#4A5854;--ink-3:#6E7C77;
    --rule:#D2D9D1;--rule-soft:#E2E7E1;--teal:#0E5B54;--teal-ink:#0E5B54;--teal-soft:#DCEAE7;
    --amber:#A25714;--amber-ink:#8A4A11;--lattice:rgba(14,91,84,.055)}
  @media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#0E1412;--surface:#151D1A;
    --surface-2:#1B2521;--ink:#E7EDE9;--ink-2:#A3B1AB;--ink-3:#7E8C87;--rule:#2A3733;--rule-soft:#212C29;
    --teal:#5FC2B1;--teal-ink:#7FD3C3;--teal-soft:#16302C;--amber:#D9954E;--amber-ink:#E5AA6C;
    --lattice:rgba(95,194,177,.06)}}
  :root[data-theme="dark"]{--paper:#0E1412;--surface:#151D1A;--surface-2:#1B2521;--ink:#E7EDE9;
    --ink-2:#A3B1AB;--ink-3:#7E8C87;--rule:#2A3733;--rule-soft:#212C29;--teal:#5FC2B1;--teal-ink:#7FD3C3;
    --teal-soft:#16302C;--amber:#D9954E;--amber-ink:#E5AA6C;--lattice:rgba(95,194,177,.06)}
  *{box-sizing:border-box}
  body{background:var(--paper);color:var(--ink);margin:0;font-family:"Source Serif 4",Georgia,serif;
    font-size:16.5px;line-height:1.6;-webkit-font-smoothing:antialiased}
  main{max-width:940px;margin:0 auto;padding:0 26px 72px}
  h1,h2,h3,h4{font-family:"Familjen Grotesk","Helvetica Neue",Arial,sans-serif;text-wrap:balance}
  code,pre{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
  h1{font-size:clamp(30px,5vw,42px);line-height:1.04;font-weight:700;letter-spacing:-.03em;
    margin:0;padding:48px 0 0}
  h1+p{color:var(--ink-2);font-size:17.5px;max-width:66ch}
  h2{font-size:23px;font-weight:600;letter-spacing:-.02em;margin:44px 0 10px;padding-top:10px}
  h3{font-size:16.5px;font-weight:600;margin:30px 0 8px}
  h4{font-size:15px;font-weight:600;margin:24px 0 6px;color:var(--ink-2)}
  p{margin:0 0 14px;text-wrap:pretty;max-width:78ch}
  hr{border:0;border-top:1px solid var(--rule);margin:38px 0}
  a{color:var(--teal-ink);text-underline-offset:3px}
  a:focus-visible{outline:2px solid var(--teal);outline-offset:3px}
  ul,ol{padding-left:22px;margin:0 0 14px;max-width:78ch}li{margin-bottom:6px}
  code{background:var(--surface-2);padding:1px 5px;border-radius:2px;font-size:.86em}
  pre{background:var(--surface);border:1px solid var(--rule);border-radius:3px;padding:14px 16px;
    overflow-x:auto;font-size:12.5px;line-height:1.62;margin:16px 0}
  pre code{background:none;padding:0}
  blockquote{margin:18px 0;padding:12px 18px;border-left:3px solid var(--teal);
    background:var(--teal-soft);border-radius:0 3px 3px 0;color:var(--ink)}
  blockquote p{margin:0}
  .tbl{overflow-x:auto;margin:16px 0}
  table{border-collapse:collapse;width:100%;font-size:14.5px;min-width:520px}
  th,td{text-align:left;padding:9px 14px 9px 0;border-bottom:1px solid var(--rule-soft);
    vertical-align:top}
  th{font-family:"Familjen Grotesk",sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.09em;
    text-transform:uppercase;color:var(--ink-3);border-bottom-color:var(--rule)}
  header.top{border-bottom:1px solid var(--rule);
    background:repeating-linear-gradient(45deg,var(--lattice) 0 1px,transparent 1px 22px),
      repeating-linear-gradient(-45deg,var(--lattice) 0 1px,transparent 1px 22px)}
  header.top div{max-width:940px;margin:0 auto;padding:0 26px 40px}
  .eyebrow{font-family:"Familjen Grotesk",sans-serif;font-size:11px;font-weight:600;
    letter-spacing:.13em;text-transform:uppercase;color:var(--teal-ink);padding-top:44px}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  html{scroll-behavior:smooth;scroll-padding-top:20px}
</style>`

const MD_PAGES = [{ src: 'REFERENCE.md', out: 'reference.html', title: 'Trellis Reference' }]

for (const { src, out, title } of MD_PAGES) {
  const file = join(ROOT, src)
  if (!existsSync(file)) { console.log(`- ${src} — not found, skipped`); continue }
  const md = readFileSync(file, 'utf8')
  // The h1 and its lede move into a banded header; the rest is the body.
  const body = renderMarkdown(md)
  const m = body.match(/^<h1[^>]*>[\s\S]*?<\/h1>\n?(<p>[\s\S]*?<\/p>)?/)
  const head = m ? m[0] : ''
  const rest = m ? body.slice(m[0].length) : body
  const page =
    `<title>${title}</title>\n` +
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&display=swap">\n' +
    REFERENCE_CSS + '\n' +
    `<header class="top"><div><div class="eyebrow">Trellis · generated from ${src}</div>${head}</div></header>\n` +
    `<main>${rest}</main>\n`
  writeFileSync(join(SRC, out), page)
  console.log(`✓ ${src} → docs/${out}  (${(page.length / 1024).toFixed(1)} KB, generated — do not edit)`)
}

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
