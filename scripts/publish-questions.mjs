#!/usr/bin/env node
// trellis — render one audience's open questions as a page they can read in their own tool.
//
// `questions.mjs` prints markdown, which somebody then has to carry. The people who own half these
// answers work in Claude and will not open a repository; markdown pasted into a chat asks them to come
// to us. This renders their questions as a self-contained page instead.
//
//   node publish-questions.mjs <spec.md> --for "<audience>" [--out <dir>]
//   node publish-questions.mjs <spec.md> --for "<audience>" --url         what was published before
//   node publish-questions.mjs <spec.md> --for "<audience>" --record <url>
//
// **This script never publishes and never claims to.** It writes a file and prints where it is. Only
// the model's own tool can publish, and only because a person asked — publishing is outward-facing, the
// page can be shared onward, and that is not a decision a script gets to make.
//
// Three disciplines the page itself has to carry:
//
//   · **It is generated.** It says so on its face, the same way docs/reference.html does. A page
//     somebody edits becomes a second source of truth, and then one decision lives in two places and
//     nothing tells you which one the reader used.
//   · **It carries no settled decision.** The questions, and the spec's Why and Outcome as background.
//     Not the Decisions table, not the refusals, nothing below the spec line. Publishing a closed
//     decision invites it to be reopened by the reader least equipped to judge it.
//   · **The stored URL is the whole feature.** Re-publishing has to update the same page. A new link
//     on every publish leaves a decision-maker commenting on an abandoned one, and they will not
//     report it — they will just stop answering.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, basename, relative } from 'node:path'
import { readSpec, matchAudience } from './lib/questions.mjs'
import { findRepoRoot } from './lib/profile.mjs'

const REGISTRY = join('.trellis', 'published.json')
const DEFAULT_OUT = join('.trellis', 'pages')

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const today = () => new Date().toISOString().slice(0, 10)

// ── the registry ─────────────────────────────────────────────────────────────
// A published URL is session bookkeeping, not part of the requirement, so it does not go in the spec.
// `questions.mjs` established that a tool does not write into a spec, and §2 exists so that a spec
// cannot shift under a contract already running against it.
const registryPath = root => join(root, REGISTRY)

function readRegistry (root) {
  const p = registryPath(root)
  if (!existsSync(p)) return {}
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return {} }
}

function writeRegistry (root, data) {
  const p = registryPath(root)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
}

// ── markdown, only as far as a question needs ────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Code spans are lifted out before emphasis, because a path like `docs/*.md` otherwise eats the
// asterisks and the rest of the line with them.
//
// The placeholder is a bracket pair, not a bare number. A space-delimited digit collides with
// ordinary prose — "we ship 3 of the 4 options" comes back as "we shipundefinedof theundefined
// options" — and two adjacent code spans share the delimiter, so one is lost. This form cannot
// appear in a spec, survives escaping unchanged, and would be visible rather than silent if it did.
function inline (md) {
  const spans = []
  let s = esc(md).replace(/`([^`]+)`/g, (_, c) => `⟦${spans.push(`<code>${c}</code>`) - 1}⟧`)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // `[^*]` rather than `[^*\n]`: prose() has already split on blank lines, so a newline inside a block
  // is a wrapped sentence, not the end of the emphasis. The first real page rendered a whole quoted
  // sentence with its asterisks showing because the quote happened to wrap.
  s = s.replace(/(^|[\s(])\*([^*]+?)\*/g, '$1<em>$2</em>')
  return s.replace(/⟦(\d+)⟧/g, (_, i) => spans[Number(i)])
}

// Paragraphs, quotes and lists. Anything more structured than this inside one question is a sign the
// question is really two.
function prose (md) {
  if (!md) return ''
  return md.split(/\n{2,}/).map(block => {
    const b = block.trim()
    if (!b) return ''
    if (b.split('\n').every(l => l.startsWith('>'))) {
      return `<blockquote>${inline(b.replace(/^>\s?/gm, '').trim())}</blockquote>`
    }
    if (/^[-*]\s/.test(b)) {
      const items = b.split(/\n(?=[-*]\s)/).map(l => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`)
      return `<ul>${items.join('')}</ul>`
    }
    // A numbered list is how a spec states a sequence. Rendered as a paragraph it kept the digits and
    // lost the sequence, which the first real page showed on the one block that mattered most.
    if (/^\d+\.\s/.test(b)) {
      const items = b.split(/\n(?=\d+\.\s)/).map(l => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`)
      return `<ol>${items.join('')}</ol>`
    }
    return `<p>${inline(b)}</p>`
  }).join('\n')
}

// ── the page ─────────────────────────────────────────────────────────────────
function render ({ spec, group, specFile, generated }) {
  const owner = spec.data.owner && spec.data.owner !== '~' ? spec.data.owner : null
  const title = spec.data.title || spec.data.id

  const questions = group.questions.map((q, i) => `
      <article class="q" id="${q.id ? slug(q.id) : 'q' + (i + 1)}">
        <div class="q-id">${esc(q.id || `Q-${String(i + 1).padStart(2, '0')}`)}</div>
        <h2>${inline(q.title)}</h2>
        ${prose(q.context)}
        ${q.ifNobodyAnswers
          ? `<div class="cost"><div class="cost-label">If nobody answers</div>${prose(q.ifNobodyAnswers)}</div>`
          : '<div class="cost cost-unknown"><div class="cost-label">If nobody answers</div>' +
            '<p>Not stated. Worth asking before you decide — a question whose default nobody has ' +
            'named is the expensive kind.</p></div>'}
        ${q.detail ? `<details><summary>Technical detail</summary>${prose(q.detail)}</details>` : ''}
        ${q.answered ? '<p class="answered">This question already carries an answer on the spec.</p>' : ''}
      </article>`).join('\n')

  return `<title>Open Decisions · ${esc(group.audience)}</title>
<style>
  :root{
    --paper:#F4F5F3;--surface:#FFFFFF;--sunk:#EBEEE9;--ink:#161E1C;--ink-2:#4C5854;--ink-3:#727E79;
    --rule:#D6DCD5;--rule-soft:#E4E9E3;--teal:#0E5B54;--brick:#9C3D22;--brick-soft:#FBEDE7;
    --brick-rule:#E8C4B4;--shadow:0 1px 2px rgba(20,31,28,.05),0 8px 22px -14px rgba(20,31,28,.18)
  }
  @media(prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --paper:#0F1513;--surface:#17201D;--sunk:#131A18;--ink:#E8EDEA;--ink-2:#A5B2AD;--ink-3:#7C8985;
    --rule:#2A3733;--rule-soft:#212C29;--teal:#63C4B3;--brick:#E39070;--brick-soft:#26170F;
    --brick-rule:#553024;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 22px -14px rgba(0,0,0,.6)
  }}
  :root[data-theme="dark"]{
    --paper:#0F1513;--surface:#17201D;--sunk:#131A18;--ink:#E8EDEA;--ink-2:#A5B2AD;--ink-3:#7C8985;
    --rule:#2A3733;--rule-soft:#212C29;--teal:#63C4B3;--brick:#E39070;--brick-soft:#26170F;
    --brick-rule:#553024;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 22px -14px rgba(0,0,0,.6)
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:ui-serif,Georgia,"Iowan Old Style","Times New Roman",serif;
    font-size:17px;line-height:1.62;-webkit-font-smoothing:antialiased}
  .wrap{max-width:640px;margin:0 auto;padding:0 24px 80px}
  header{border-bottom:1px solid var(--rule);margin-bottom:34px}
  .eyebrow{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:10.5px;font-weight:650;letter-spacing:.15em;text-transform:uppercase;
    color:var(--teal);padding:44px 0 14px}
  h1{font-size:clamp(26px,4.6vw,34px);line-height:1.14;letter-spacing:-.021em;font-weight:600;
    margin:0 0 16px;text-wrap:balance}
  .meta{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12.5px;color:var(--ink-3);
    padding-bottom:26px;
    font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .meta b{font-weight:600;color:var(--ink-2)}
  .lede{font-size:18px;color:var(--ink-2);margin:0 0 30px;max-width:58ch;text-wrap:pretty}
  .ctx{background:var(--sunk);border:1px solid var(--rule-soft);border-radius:5px;
    padding:18px 20px 4px;margin:0 0 40px}
  .ctx-label{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:10.5px;font-weight:650;letter-spacing:.13em;text-transform:uppercase;
    color:var(--ink-3);margin-bottom:10px}
  .ctx p,.ctx blockquote{font-size:15px;color:var(--ink-2)}
  .ctx h3{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:12px;
    font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin:18px 0 6px}
  .q{background:var(--surface);border:1px solid var(--rule);border-radius:6px;
    box-shadow:var(--shadow);padding:24px 26px;margin:0 0 22px}
  .q-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;font-weight:500;
    letter-spacing:.06em;color:var(--teal);margin-bottom:8px}
  .q h2{font-size:20.5px;line-height:1.28;font-weight:600;letter-spacing:-.014em;
    margin:0 0 12px;text-wrap:pretty}
  .q p{margin:0 0 12px;color:var(--ink-2)}
  .q>p:first-of-type{color:var(--ink)}
  .cost{background:var(--brick-soft);border:1px solid var(--brick-rule);
    border-left:3px solid var(--brick);border-radius:0 4px 4px 0;padding:13px 16px 1px;margin:16px 0 4px}
  .cost-label{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:10.5px;font-weight:650;letter-spacing:.11em;text-transform:uppercase;
    color:var(--brick);margin-bottom:6px}
  .cost p{font-size:15px;margin:0 0 12px;color:var(--ink)}
  .cost-unknown{--brick-soft:var(--sunk);--brick-rule:var(--rule-soft)}
  details{margin-top:14px;border-top:1px solid var(--rule-soft);padding-top:12px}
  summary{font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:12.5px;font-weight:600;color:var(--ink-3);cursor:pointer}
  summary:focus-visible{outline:2px solid var(--teal);outline-offset:3px;border-radius:2px}
  details p,details ul{font-size:14.5px;color:var(--ink-2);margin:10px 0 0}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;
    background:var(--sunk);padding:1px 5px;border-radius:2px}
  blockquote{margin:12px 0;padding-left:14px;border-left:2px solid var(--rule);
    color:var(--ink-2);font-style:italic}
  blockquote p{margin:0}
  ul,ol{padding-left:22px;margin:0 0 12px}li{margin-bottom:5px;color:var(--ink-2)}
  a{color:var(--teal);text-underline-offset:3px}
  .answered{font-size:14px;color:var(--teal)}
  footer{border-top:1px solid var(--rule);margin-top:40px;padding-top:22px;font-size:13px;
    color:var(--ink-3);
    font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  footer strong{color:var(--ink-2)}
  footer p{margin:0 0 10px}
  .gen{font-size:11.5px;color:var(--ink-3);margin-top:18px;line-height:1.5}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
<div class="wrap">
  <header>
    <div class="eyebrow">Open decisions · ${esc(group.audience)}</div>
    <h1>${inline(title)}</h1>
    <div class="meta">
      <span><b>${group.questions.length}</b> ${group.questions.length === 1 ? 'question' : 'questions'}</span>
      <span>Owner <b>${owner ? esc(owner) : 'unassigned'}</b></span>
      <span>Spec status <b>${esc(spec.data.status || 'unknown')}</b></span>
      <span>${esc(generated)}</span>
    </div>
  </header>

  <p class="lede">These are the decisions we cannot make for you. Everything else is already
  underway.</p>

  ${(spec.why || spec.outcome)
    ? `<div class="ctx">
    <div class="ctx-label">Background — already decided, for context</div>
    ${spec.why ? `<h3>Why this exists</h3>${prose(spec.why)}` : ''}
    ${spec.outcome ? `<h3>What it will do</h3>${prose(spec.outcome)}` : ''}
  </div>`
    : ''}

${questions}

  <footer>
    <p><strong>To answer:</strong> leave a comment on this page. Name the question id, and if you
    cannot decide yet, say what would let you — that is a useful answer and a silence is not.</p>
    <p>Each answer is written back onto the spec by hand, with your name and the date, so the decision
    stays attached to whoever made it.</p>
    <p class="gen">Generated from <code>${esc(specFile)}</code> — do not edit this page. It is rebuilt
    from the spec whenever the questions change, and an edit here would be overwritten, having
    disagreed with the record in the meantime.</p>
  </footer>
</div>
`
}

// ── cli ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(`--${name}`); return i === -1 ? null : args[i + 1] }
const has = name => args.includes(`--${name}`)

const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const audience = flag('for')

if (!file || !audience) {
  console.error('usage: publish-questions.mjs <spec.md> --for "<audience>" [--out <dir>] [--url] [--record <url>]')
  process.exit(2)
}

const spec = readSpec(file)
if (spec.error) { console.error(`${file}: ${spec.error}`); process.exit(2) }

const matched = matchAudience(spec.groups, audience)
if (!matched.length) {
  console.error(`no audience matching "${audience}" in ${basename(file)}. Audiences: ` +
    (spec.groups.map(g => g.audience).join(' · ') || '(none)'))
  process.exit(1)
}
// One page addresses one audience. A page for two is a page neither of them owns, and neither answers.
if (matched.length > 1) {
  console.error(`"${audience}" matches ${matched.length} audiences: ${matched.map(g => g.audience).join(' · ')}`)
  console.error('Name one. A page addressed to two audiences is a page neither of them owns.')
  process.exit(1)
}

const group = matched[0]
const root = findRepoRoot(dirname(file) || '.') || process.cwd()
const specRel = relative(root, file) || file
const specId = spec.data.id || slug(basename(file, '.md'))
const key = `${specId}::${slug(group.audience)}`
const registry = readRegistry(root)

// Prints the URL alone, or nothing, so the caller can tell an update from a first publish.
if (has('url')) {
  if (registry[key]?.url) { console.log(registry[key].url); process.exit(0) }
  process.exit(1)
}

if (has('record')) {
  const url = flag('record')
  if (!url || !/^https?:\/\//.test(String(url))) {
    console.error('--record needs the published URL')
    process.exit(2)
  }
  const prior = registry[key]?.url
  registry[key] = {
    audience: group.audience,
    spec: specRel,
    url,
    recorded: today(),
    page: registry[key]?.page ?? join(DEFAULT_OUT, `${specId}--${slug(group.audience)}.html`)
  }
  writeRegistry(root, registry)
  console.log(`recorded  ${key}`)
  console.log(`url       ${url}`)
  if (prior && prior !== url) {
    console.log(`\nwarning: this replaced a different URL (${prior}). Anybody holding the old page is ` +
      'now commenting where nothing reads. Say so rather than letting them find out.')
  }
  process.exit(0)
}

const outDir = flag('out') || join(root, DEFAULT_OUT)
const pageName = `${specId}--${slug(group.audience)}.html`
const pagePath = join(outDir, pageName)
mkdirSync(outDir, { recursive: true })
writeFileSync(pagePath, render({ spec, group, specFile: specRel, generated: today() }))

// Everything the caller needs in order to publish correctly, and nothing it has to infer.
console.log(`page       ${pagePath}`)
console.log(`title      Open Decisions · ${group.audience}`)
console.log(`audience   ${group.audience}`)
console.log(`questions  ${group.questions.length}`)
console.log(`owner      ${spec.data.owner ?? 'unassigned'}`)
console.log(`existing   ${registry[key]?.url ?? 'none — publishing this creates a new page'}`)
console.log(`record     node publish-questions.mjs ${specRel} --for "${group.audience}" --record <url>`)

const missing = group.questions.filter(q => !q.ifNobodyAnswers).length
if (missing) {
  console.log(`\nwarning: ${missing} of ${group.questions.length} questions do not say what ships if ` +
    'nobody answers. The page says so rather than hiding it, but the question is weaker for it.')
}
if (!spec.data.owner || spec.data.owner === '~') {
  console.log('\nwarning: this spec has no owner. The page says "unassigned", which tells the reader ' +
    'their answer has nobody to land it.')
}
