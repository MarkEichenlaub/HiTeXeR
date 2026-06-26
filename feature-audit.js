'use strict';
/**
 * feature-audit.js
 *
 * Runs every corpus diagram through the HiTeXeR interpreter (execute only — no
 * raster) and harvests the instrumentation log (globalThis.__htxUnknown) plus
 * any render-time throws. Produces a ranked report of:
 *   • unresolved named function calls ("Unknown function") — i.e. APIs the
 *     interpreter does not implement, ranked by how many DISTINCT corpus
 *     diagrams hit them (the real "under-implemented feature" priority list);
 *   • diagrams that throw outright (interpreter can't render → server fallback),
 *     grouped by error message.
 *
 * This is the mechanical Goal-A "hidden on page 74" finder for missing features:
 * it tells you which gaps actually occur in real diagrams, weighted by impact.
 *
 * Usage:
 *   node feature-audit.js                 # full corpus
 *   node feature-audit.js --limit 500     # quick sample
 *   node feature-audit.js --collection c  # only cN (team) diagrams
 */

const fs   = require('fs');
const path = require('path');

// ── node render harness (same shim _render_one.js uses) ──
global.window = global.window || {};
global.katex = require('katex');
require(path.resolve(__dirname, 'asy-interp.js'));
const AsyInterp = global.window.AsyInterp;
const UNK = global.__htxUnknown;

const ROOT       = __dirname;
const CORPUS_DIR = path.join(ROOT, 'asy_corpus');
const OUT_JSON   = path.join(ROOT, 'comparison', 'feature-audit.json');
const OUT_TXT    = path.join(ROOT, 'comparison', 'feature-audit.txt');

// Files known to hang the synchronous interpreter (from ssim-pipeline.js).
const HANG_SKIP = new Set(['gallery_2Dgraphs_electromagnetic.asy']);

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}
const LIMIT = arg('limit') ? parseInt(arg('limit'), 10) : Infinity;
const COLL  = arg('collection') ? String(arg('collection')) : null;

function getCollection(filename) {
  const cm = filename.match(/^(c\d+)_/); if (cm) return cm[1];
  const gm = filename.match(/^gallery_([A-Za-z0-9]+)_/); if (gm) return 'gallery_' + gm[1];
  if (filename.startsWith('gallery_')) return 'gallery';
  return 'unknown';
}

let files = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.asy')).sort();
if (COLL) files = files.filter(f => getCollection(f).startsWith(COLL));
if (files.length > LIMIT) files = files.slice(0, LIMIT);

console.log(`Auditing ${files.length} diagrams${COLL ? ` (collection~${COLL})` : ''}…`);

// fn name -> { count, diagrams:Set, byColl:{} }
const unknownFns = new Map();
// error message (normalized) -> { count, examples:[] }
const errors = new Map();
let ok = 0, threw = 0, skipped = 0;
const t0 = Date.now();

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  if (HANG_SKIP.has(file)) { skipped++; continue; }
  const coll = getCollection(file);
  let src;
  try { src = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8'); } catch { continue; }

  UNK.recent.length = 0;            // isolate this diagram's unknown calls
  let errMsg = null;
  try {
    AsyInterp._createInterpreter().execute('[asy]\n' + src + '\n[/asy]', { containerW: 800, containerH: 600 });
    ok++;
  } catch (e) {
    threw++;
    errMsg = String((e && e.message) || e);
  }

  // unique fn names this diagram hit
  const hit = new Set();
  for (const entry of UNK.recent) { const name = entry.split('/')[0]; if (name) hit.add(name); }
  for (const name of hit) {
    let rec = unknownFns.get(name);
    if (!rec) { rec = { count: 0, diagrams: new Set(), byColl: Object.create(null) }; unknownFns.set(name, rec); }
    rec.count++; rec.diagrams.add(file); rec.byColl[coll] = (rec.byColl[coll] || 0) + 1;
  }

  if (errMsg) {
    // normalize: drop line numbers / quoted specifics so similar throws group
    const norm = errMsg.replace(/line \d+/g, 'line N').replace(/'[^']*'/g, "'…'").replace(/\d+/g, 'N').slice(0, 120);
    let er = errors.get(norm);
    if (!er) { er = { count: 0, examples: [] }; errors.set(norm, er); }
    er.count++; if (er.examples.length < 6) er.examples.push({ file, coll, msg: errMsg.slice(0, 160) });
  }

  if ((i + 1) % 1000 === 0) process.stdout.write(`\r  ${i + 1}/${files.length}`);
}
process.stdout.write('\n');
console.log(`Executed ${ok} ok, ${threw} threw, ${skipped} skipped in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// ── rank ──
const unknownList = [...unknownFns.entries()].map(([name, r]) => ({
  name, diagrams: r.diagrams.size, calls: r.count,
  topCollections: Object.entries(r.byColl).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c}:${n}`),
})).sort((a, b) => b.diagrams - a.diagrams);

const errorList = [...errors.entries()].map(([norm, r]) => ({
  pattern: norm, count: r.count, examples: r.examples,
})).sort((a, b) => b.count - a.count);

fs.writeFileSync(OUT_JSON, JSON.stringify({
  scanned: files.length, ok, threw, skipped,
  unresolvedCalls: unknownList, renderThrows: errorList,
}, null, 1));

// ── human-readable ──
const lines = [];
lines.push(`HiTeXeR feature audit — ${files.length} diagrams (${ok} ok, ${threw} threw)`);
lines.push('');
lines.push(`== Unresolved function calls (ranked by # of distinct diagrams) ==`);
lines.push(`${'count'.padStart(6)} ${'calls'.padStart(7)}  function           top collections`);
for (const u of unknownList.slice(0, 80)) {
  lines.push(`${String(u.diagrams).padStart(6)} ${String(u.calls).padStart(7)}  ${u.name.padEnd(18)} ${u.topCollections.join('  ')}`);
}
lines.push('');
lines.push(`== Render throws (ranked, normalized) ==`);
for (const e of errorList.slice(0, 40)) {
  lines.push(`${String(e.count).padStart(5)}  ${e.pattern}`);
  lines.push(`        e.g. ${e.examples[0].file}: ${e.examples[0].msg}`);
}
const txt = lines.join('\n');
fs.writeFileSync(OUT_TXT, txt + '\n');
console.log('\n' + txt.split('\n').slice(0, 50).join('\n'));
console.log(`\nWrote ${OUT_JSON} and ${OUT_TXT}`);
