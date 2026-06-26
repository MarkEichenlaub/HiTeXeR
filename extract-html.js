'use strict';
/**
 * extract-html.js
 *
 * Extracts runnable Asymptote example snippets from the official texinfo HTML
 * manual (https://asymptote.sourceforge.io/doc/) into asy_corpus_ext/ as
 * ext_<source>_<page>_<n>.asy. The Tutorial chapter pages become ext:tutorial;
 * every other page becomes ext:manual.
 *
 * Quality strategy: extract liberally (any <pre> with a real drawing STATEMENT,
 * not a prototype), dedupe, and let the downstream TeXeR fetch drop anything
 * that doesn't compile/render (ext-pipeline fetch reports compile_error).
 *
 * Usage: node extract-html.js [--limit-per-page N]
 */

const fs   = require('fs');
const path = require('path');

const BASE = 'https://asymptote.sourceforge.io/doc/';
const OUT  = path.join(__dirname, 'asy_corpus_ext');
fs.mkdirSync(OUT, { recursive: true });

const TUTORIAL_PAGES = new Set([
  'Tutorial.html','Drawing-in-batch-mode.html','Drawing-in-interactive-mode.html',
  'Figure-size.html','Labels.html','Paths.html',
]);
// Non-graphical / non-statically-renderable pages — skip entirely.
const SKIP_PAGES = new Set([
  'index.html','General-Index.html','Concept-Index.html','Credits.html','Help.html',
  'Installation.html','Compiling-from-UNIX-source.html','UNIX-binary-distributions.html',
  'macOS-X-binary-distributions.html','Microsoft-Windows.html','GUI-installation.html',
  'GUI-usage.html','GUI.html','Configuring.html','Search-paths.html','Editing-modes.html',
  'Command_002dLine-Interface.html','Options.html','Interactive-mode.html','Debugger.html',
  'Git.html','Building-the-documentation.html','Uninstall.html','Language-server-protocol.html',
  'Help.html','Description.html','PostScript-to-Asymptote.html','pstoedit.html','MetaPost.html',
  'Files.html','Import.html','Templated-imports.html','Developer-modules.html','User-modules.html',
  'animate.html','animation.html','embed.html','external.html','obj.html','v3d.html','slide.html',
  'babel.html','LaTeX-usage.html','Command-Line-Interface.html',
]);

const argv = process.argv.slice(2);
const LPP = argv.indexOf('--limit-per-page') >= 0 ? parseInt(argv[argv.indexOf('--limit-per-page')+1],10) : Infinity;

function decodeEntities(s) {
  return s.replace(/<\/?[a-zA-Z][^>]*>/g, '')   // strip inner HTML tags (anchors etc.)
          .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
          .replace(/&#39;/g,"'").replace(/&rsquo;/g,"'").replace(/&lsquo;/g,"'")
          .replace(/&rdquo;/g,'"').replace(/&ldquo;/g,'"').replace(/&minus;/g,'-')
          .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
}

// A block qualifies if it contains a real drawing STATEMENT (line starting with a
// draw/fill/label/… call), not merely the token inside a prototype/return type.
const STMT_RE = /^\s*(draw|filldraw|fill|label|dot|shipout|add|attach|markangle|markrightangle|drawline|perpendicular|pen\s+\w+\s*=)?\s*(draw|filldraw|fill|label|dot|shipout|add|axes|xaxis|yaxis|markangle)\s*\(/m;
const BAD_RE  = /\b(import\s+animation|import\s+animate|embed\s*\(|settings\s*\.|while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;|input\s*\(|access\s+|currentprojection\s*=\s*perspective)\b/;

function isExample(code) {
  if (code.length < 12 || code.length > 4000) return false;
  if (!STMT_RE.test(code)) return false;
  if (BAD_RE.test(code)) return false;
  // skip pure prototype dumps: no '(' call with args on its own statement line is
  // already handled by STMT_RE; also require at least one ';'
  if (!code.includes(';')) return false;
  return true;
}

function pageSlug(page) { return page.replace(/\.html$/,'').replace(/[^A-Za-z0-9]/g,'').toLowerCase(); }

async function getPages() {
  const idx = await (await fetch(BASE + 'index.html')).text();
  const set = new Set();
  for (const m of idx.matchAll(/href="([A-Za-z0-9_-]+\.html)"/g)) set.add(m[1]);
  return [...set].sort();
}

async function main() {
  let pages;
  try { pages = await getPages(); }
  catch (e) { console.error('Could not fetch index: ' + e.message); process.exit(1); }
  console.log(`${pages.length} pages; skipping ${[...pages].filter(p=>SKIP_PAGES.has(p)).length}`);

  const seen = new Set();   // dedupe by normalized code
  let nManual = 0, nTut = 0, nPages = 0;
  const counts = {};

  for (const page of pages) {
    if (SKIP_PAGES.has(page)) continue;
    let html;
    try { html = await (await fetch(BASE + page)).text(); }
    catch (e) { console.log(`  fetch fail ${page}: ${e.message}`); continue; }
    nPages++;
    const source = TUTORIAL_PAGES.has(page) ? 'tutorial' : 'manual';
    const slug = pageSlug(page);
    let idx = 0, kept = 0;
    for (const m of html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)) {
      if (kept >= LPP) break;
      const code = decodeEntities(m[1]).replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim();
      if (!isExample(code)) continue;
      const norm = code.replace(/\s+/g,' ').trim();
      if (seen.has(norm)) continue;
      seen.add(norm);
      idx++; kept++;
      const id = `ext_${source}_${slug}_${idx}`;
      fs.writeFileSync(path.join(OUT, id + '.asy'), code + '\n');
      if (source === 'tutorial') nTut++; else nManual++;
      counts[page] = (counts[page]||0) + 1;
    }
  }
  console.log(`\nExtracted from ${nPages} pages: ${nManual} manual + ${nTut} tutorial examples → ${OUT}`);
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,25);
  console.log('Top pages by example count:');
  for (const [p,c] of top) console.log(`  ${String(c).padStart(3)}  ${p}`);
}
main().catch(e => { console.error(e); process.exit(1); });
