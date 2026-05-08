'use strict';
/**
 * fix-eps-svgs.js
 *
 * Re-render every corpus diagram that uses graphic() with a /var/www/cdn/...
 * EPS path. We force a re-render (not just delete-and-let-recompute-htx-skip)
 * because many existing SVGs were rendered before the sentinel mechanism for
 * `"\reflectbox{" + graphic(...) + "}"` worked correctly: those SVGs embed
 * only the un-mirrored graphic() and render the reflected copy as literal
 * "[object Object]" KaTeX text.
 *
 * Reports per diagram:
 *   - graphic() call count in source
 *   - <image>/<use> hrefs to image symbols in the rendered SVG
 *   - any cache errors that justify a placeholder fallback
 */

const fs = require('fs');
const path = require('path');

const ROOT       = __dirname;
const ASY_SRC    = path.join(ROOT, 'comparison', 'asy_src');
const SVG_DIR    = path.join(ROOT, 'comparison', 'htx_svgs');
const HTX_DIR    = path.join(ROOT, 'comparison', 'htx_pngs');

const eps_re = /\/var\/www\/cdn\/[^\s"'\\)]+/g;
const graphic_call_re = /\bgraphic\s*\(/g;

const files = fs.readdirSync(ASY_SRC).filter(f => f.endsWith('.asy'));
const epsIDs = [];
const meta = {};
for (const f of files) {
  const raw = fs.readFileSync(path.join(ASY_SRC, f), 'utf8');
  const epsMatches = [...new Set((raw.match(eps_re) || []))];
  if (!epsMatches.length) continue;
  const id = f.replace('.asy', '');
  const graphicCalls = (raw.match(graphic_call_re) || []).length;
  epsIDs.push(id);
  meta[id] = { paths: epsMatches, graphicCalls };
}
console.log(`Found ${epsIDs.length} corpus diagrams with EPS references`);

global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const epsCache = require('./eps-cache');
const cacheIdx = epsCache.loadIndex();

let rerendered = 0, kept = 0, failed = 0;
const results = [];

for (const id of epsIDs) {
  const svgP = path.join(SVG_DIR, id + '.svg');
  const pngP = path.join(HTX_DIR, id + '.png');
  const asyP = path.join(ASY_SRC, id + '.asy');

  // Always re-render so we pick up the latest interpreter behaviour.
  if (fs.existsSync(svgP)) fs.unlinkSync(svgP);
  if (fs.existsSync(pngP)) fs.unlinkSync(pngP);

  const raw = fs.readFileSync(asyP, 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';
  let imageCache = {};
  try { imageCache = epsCache.getImageCache(raw); } catch (e) {}

  let renderStatus = 'rendered';
  try {
    const r = A.render(code, { containerW: 800, containerH: 600, imageCache });
    fs.writeFileSync(svgP, r.svg);
    rerendered++;
  } catch (e) {
    renderStatus = 'fail:' + e.message;
    failed++;
  }

  // Verify
  let imageCount = 0, useImageCount = 0, placeholderCount = 0,
      objectObjectCount = 0, sentinelLeak = 0;
  if (fs.existsSync(svgP)) {
    const s = fs.readFileSync(svgP, 'utf8');
    imageCount = (s.match(/<image\s/g) || []).length;
    useImageCount = (s.match(/<use href="#htx-img-/g) || []).length;
    placeholderCount = (s.match(/fill="#e0e0e0" stroke="#999"/g) || []).length;
    objectObjectCount = (s.match(/object Object/gi) || []).length;
    sentinelLeak = (s.match(/__HITEXER_GRAPHIC_/g) || []).length;
  }

  // Cache status for this diagram's paths
  const cacheStatus = meta[id].paths.map(p => {
    const e = cacheIdx[p];
    if (!e) return { path: p, status: 'missing' };
    if (e.error) return { path: p, status: 'error', error: e.error };
    return { path: p, status: 'ok' };
  });
  const cacheErrCount = cacheStatus.filter(c => c.status !== 'ok').length;
  const cacheOkCount  = cacheStatus.filter(c => c.status === 'ok').length;
  // Each cached EPS path should produce at least one image element (either
  // <image> inline or <use> referencing a symbol).
  const totalEmbeds = imageCount + useImageCount;

  results.push({
    id,
    graphicCalls: meta[id].graphicCalls,
    paths: meta[id].paths,
    cacheStatus,
    renderStatus,
    imageCount, useImageCount, totalEmbeds,
    placeholderCount, objectObjectCount, sentinelLeak,
    cacheOkCount, cacheErrCount,
  });
}
console.log(`Re-rendered: ${rerendered}, failed: ${failed}`);

// Categorize
let allOk = 0, partialEmbed = 0, allPlaceholder = 0, leaked = 0;
const problems = [];
for (const r of results) {
  if (r.sentinelLeak || r.objectObjectCount) {
    leaked++;
    problems.push({...r, kind: 'leak'});
    continue;
  }
  if (r.totalEmbeds >= r.cacheOkCount && r.totalEmbeds >= 1) {
    allOk++;
    continue;
  }
  if (r.totalEmbeds === 0 && r.cacheOkCount === 0) {
    allPlaceholder++;
    continue;
  }
  partialEmbed++;
  problems.push({...r, kind: 'partial'});
}

console.log('\n=== Summary ===');
console.log(`Total EPS diagrams:                ${results.length}`);
console.log(`  Embeds match cached paths (OK):  ${allOk}`);
console.log(`  Partial embed (suspicious):      ${partialEmbed}`);
console.log(`  All paths errored, all placeholder: ${allPlaceholder}`);
console.log(`  Sentinel/object-Object leak:     ${leaked}`);

if (problems.length) {
  console.log('\n=== Suspicious diagrams ===');
  for (const r of problems) {
    console.log(`  ${r.id} kind=${r.kind} graphicCalls=${r.graphicCalls} cacheOk=${r.cacheOkCount} embeds=${r.totalEmbeds} placeholders=${r.placeholderCount} sentinelLeak=${r.sentinelLeak} objectObject=${r.objectObjectCount}`);
  }
}

const cacheErrPaths = {};
for (const r of results) {
  for (const c of r.cacheStatus) {
    if (c.status !== 'ok') {
      cacheErrPaths[c.path] = cacheErrPaths[c.path] || { ids: [], status: c.status, error: c.error };
      cacheErrPaths[c.path].ids.push(r.id);
    }
  }
}
const errPaths = Object.keys(cacheErrPaths);
if (errPaths.length) {
  console.log('\n=== EPS paths with cache errors (placeholder is correct) ===');
  for (const p of errPaths) {
    const e = cacheErrPaths[p];
    console.log(`  ${p}`);
    console.log(`    status=${e.status} error=${e.error || '-'}`);
    console.log(`    used by: ${e.ids.join(' ')}`);
  }
}

fs.writeFileSync(path.join(ROOT, 'eps-fix-report.json'),
  JSON.stringify(results, null, 2));
console.log('\nDetailed report written to eps-fix-report.json');
