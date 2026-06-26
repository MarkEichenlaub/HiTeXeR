'use strict';
/**
 * feature-audit.js
 *
 * Runs every corpus diagram through the HiTeXeR interpreter (execute only — no
 * raster) and harvests the instrumentation log (globalThis.__htxUnknown) plus
 * render-time throws, producing a ranked report of:
 *   • unresolved named function calls ("Unknown function") = APIs the interpreter
 *     doesn't implement, ranked by # of DISTINCT corpus diagrams that hit them;
 *   • diagrams that throw outright (interpreter can't render), grouped by message.
 *
 * The interpreter accumulates memory across thousands of sequential executes
 * (OOMs a single process near ~12k even at 8GB), so the DRIVER spawns small
 * child processes per slice (each starts fresh) and merges their partial JSON.
 *
 * Usage:
 *   node feature-audit.js                      # full corpus (chunked children)
 *   node feature-audit.js --limit 500          # quick sample (single process)
 *   node feature-audit.js --collection c       # only cN diagrams
 *   node feature-audit.js --chunk 2000 --par 2 # tune child slice / parallelism
 *   (internal) node feature-audit.js --part --start S --count C
 */

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT       = __dirname;
const CORPUS_DIR = path.join(ROOT, 'asy_corpus');
const OUT_JSON   = path.join(ROOT, 'comparison', 'feature-audit.json');
const OUT_TXT    = path.join(ROOT, 'comparison', 'feature-audit.txt');
const PART_DIR   = path.join(ROOT, 'comparison', '_faudit');

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
// Small chunks + a generous child heap: memory accumulates across executes, and
// gallery 3D files are especially heavy, so a big slice can OOM a child (which
// would silently drop its partial). 1000-file slices keep every child well under.
const CHUNK = arg('chunk') ? parseInt(arg('chunk'), 10) : 1000;
const PAR   = arg('par') ? parseInt(arg('par'), 10) : 2;
const IS_PART = !!arg('part');
const START = arg('start') ? parseInt(arg('start'), 10) : 0;
const COUNT = arg('count') ? parseInt(arg('count'), 10) : Infinity;

function getCollection(filename) {
  const cm = filename.match(/^(c\d+)_/); if (cm) return cm[1];
  const gm = filename.match(/^gallery_([A-Za-z0-9]+)_/); if (gm) return 'gallery_' + gm[1];
  if (filename.startsWith('gallery_')) return 'gallery';
  if (filename.startsWith('ext_')) { const e = filename.match(/^ext_([a-z0-9]+)_/); return e ? 'ext:' + e[1] : 'ext'; }
  return 'unknown';
}

function listFiles() {
  let files = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.asy')).sort();
  if (COLL) files = files.filter(f => getCollection(f).startsWith(COLL));
  return files;
}

// ── audit a slice in THIS process ───────────────────────────────
function auditSlice(files) {
  global.window = global.window || {};
  global.katex = require('katex');
  require(path.resolve(__dirname, 'asy-interp.js'));
  const AsyInterp = global.window.AsyInterp;
  const UNK = global.__htxUnknown;

  const unknownFns = new Map();  // name -> { count, diagrams:Set, byColl:{} }
  const errors = new Map();      // norm -> { count, examples:[] }
  let ok = 0, threw = 0, skipped = 0;

  for (const file of files) {
    if (HANG_SKIP.has(file)) { skipped++; continue; }
    const coll = getCollection(file);
    let src;
    try { src = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8'); } catch { continue; }
    UNK.recent.length = 0;
    let errMsg = null;
    try {
      AsyInterp._createInterpreter().execute('[asy]\n' + src + '\n[/asy]', { containerW: 800, containerH: 600 });
      ok++;
    } catch (e) { threw++; errMsg = String((e && e.message) || e); }

    const hit = new Set();
    for (const entry of UNK.recent) { const n = entry.split('/')[0]; if (n) hit.add(n); }
    for (const name of hit) {
      let r = unknownFns.get(name);
      if (!r) { r = { count: 0, diagrams: new Set(), byColl: Object.create(null) }; unknownFns.set(name, r); }
      r.count++; r.diagrams.add(file); r.byColl[coll] = (r.byColl[coll] || 0) + 1;
    }
    if (errMsg) {
      const norm = errMsg.replace(/line \d+/g, 'line N').replace(/'[^']*'/g, "'…'").replace(/\d+/g, 'N').slice(0, 120);
      let er = errors.get(norm);
      if (!er) { er = { count: 0, examples: [] }; errors.set(norm, er); }
      er.count++; if (er.examples.length < 6) er.examples.push({ file, coll, msg: errMsg.slice(0, 160) });
    }
  }
  return { unknownFns, errors, ok, threw, skipped };
}

// ── child (--part): audit slice, write partial JSON ─────────────
function runPart() {
  const files = listFiles().slice(START, START + COUNT);
  const { unknownFns, errors, ok, threw, skipped } = auditSlice(files);
  const unknown = {};
  for (const [name, r] of unknownFns) unknown[name] = { count: r.count, diagrams: [...r.diagrams], byColl: r.byColl };
  const errs = [...errors.entries()].map(([norm, r]) => ({ norm, count: r.count, examples: r.examples }));
  fs.mkdirSync(PART_DIR, { recursive: true });
  fs.writeFileSync(path.join(PART_DIR, `part-${START}.json`), JSON.stringify({ unknown, errors: errs, ok, threw, skipped }));
  process.stdout.write(`  [part ${START}..${START + files.length}] ok=${ok} threw=${threw}\n`);
}

// ── driver: spawn children, merge ───────────────────────────────
const failedSlices = [];
function spawnPart(start, count) {
  return new Promise(resolve => {
    const child = spawn(process.execPath,
      ['--max-old-space-size=4096', __filename, '--part', '--start', String(start), '--count', String(count),
       ...(COLL ? ['--collection', COLL] : [])],
      { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('close', code => {
      if (code !== 0 || !fs.existsSync(path.join(PART_DIR, `part-${start}.json`))) {
        failedSlices.push(start);
        console.log(`  !! slice ${start}..${start + count} FAILED (exit ${code}) — its diagrams are missing from the report`);
      }
      resolve(code);
    });
  });
}

async function runDriver() {
  const total = listFiles().length;
  const n = Math.min(total, LIMIT);
  console.log(`Auditing ${n} diagrams via child processes (chunk=${CHUNK}, par=${PAR})${COLL ? ` collection~${COLL}` : ''}…`);
  if (fs.existsSync(PART_DIR)) for (const f of fs.readdirSync(PART_DIR)) fs.unlinkSync(path.join(PART_DIR, f));

  const slices = [];
  for (let s = 0; s < n; s += CHUNK) slices.push([s, Math.min(CHUNK, n - s)]);
  const t0 = Date.now();
  let idx = 0;
  async function worker() { while (idx < slices.length) { const [s, c] = slices[idx++]; await spawnPart(s, c); } }
  await Promise.all(Array.from({ length: Math.min(PAR, slices.length) }, worker));
  console.log(`All slices done in ${((Date.now() - t0) / 1000).toFixed(0)}s. Merging…`);

  // merge partials
  const unknown = new Map();  // name -> { count, diagrams:Set, byColl:{} }
  const errors = new Map();
  let ok = 0, threw = 0, skipped = 0;
  for (const f of fs.readdirSync(PART_DIR).filter(f => f.endsWith('.json'))) {
    const p = JSON.parse(fs.readFileSync(path.join(PART_DIR, f), 'utf8'));
    ok += p.ok; threw += p.threw; skipped += p.skipped || 0;
    for (const [name, r] of Object.entries(p.unknown)) {
      let u = unknown.get(name);
      if (!u) { u = { count: 0, diagrams: new Set(), byColl: Object.create(null) }; unknown.set(name, u); }
      u.count += r.count;
      for (const d of r.diagrams) u.diagrams.add(d);
      for (const [c, v] of Object.entries(r.byColl)) u.byColl[c] = (u.byColl[c] || 0) + v;
    }
    for (const e of p.errors) {
      let er = errors.get(e.norm);
      if (!er) { er = { count: 0, examples: [] }; errors.set(e.norm, er); }
      er.count += e.count;
      for (const ex of e.examples) if (er.examples.length < 6) er.examples.push(ex);
    }
  }

  const unknownList = [...unknown.entries()].map(([name, r]) => ({
    name, diagrams: r.diagrams.size, calls: r.count,
    topCollections: Object.entries(r.byColl).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => `${c}:${v}`),
  })).sort((a, b) => b.diagrams - a.diagrams);
  const errorList = [...errors.entries()].map(([norm, r]) => ({ pattern: norm, count: r.count, examples: r.examples }))
    .sort((a, b) => b.count - a.count);

  fs.writeFileSync(OUT_JSON, JSON.stringify({ scanned: n, ok, threw, skipped, unresolvedCalls: unknownList, renderThrows: errorList }, null, 1));

  const covered = ok + threw + skipped;
  const lines = [];
  lines.push(`HiTeXeR feature audit — ${n} diagrams (${ok} ok, ${threw} threw, ${skipped} skipped)`);
  if (covered < n) lines.push(`!! INCOMPLETE: only ${covered}/${n} audited — ${failedSlices.length} slice(s) failed (start idx: ${failedSlices.join(', ')})`);
  lines.push('');
  lines.push(`== Unresolved function calls (ranked by # of distinct diagrams) ==`);
  lines.push(`${'diags'.padStart(6)} ${'calls'.padStart(7)}  function           top collections`);
  for (const u of unknownList.slice(0, 100))
    lines.push(`${String(u.diagrams).padStart(6)} ${String(u.calls).padStart(7)}  ${u.name.padEnd(18)} ${u.topCollections.join('  ')}`);
  lines.push('');
  lines.push(`== Render throws (ranked, normalized) ==`);
  for (const e of errorList.slice(0, 50)) {
    lines.push(`${String(e.count).padStart(5)}  ${e.pattern}`);
    if (e.examples[0]) lines.push(`        e.g. ${e.examples[0].file}: ${e.examples[0].msg}`);
  }
  const txt = lines.join('\n');
  fs.writeFileSync(OUT_TXT, txt + '\n');
  for (const f of fs.readdirSync(PART_DIR)) fs.unlinkSync(path.join(PART_DIR, f));
  console.log('\n' + txt.split('\n').slice(0, 55).join('\n'));
  console.log(`\nWrote ${OUT_JSON} and ${OUT_TXT}`);
}

// Small samples run inline (single process); full runs use the chunked driver.
if (IS_PART) runPart();
else if (LIMIT <= CHUNK) {
  console.log(`Auditing ${Math.min(listFiles().length, LIMIT)} diagrams (single process)…`);
  const files = listFiles().slice(0, LIMIT);
  const { unknownFns, errors, ok, threw, skipped } = auditSlice(files);
  const unknownList = [...unknownFns.entries()].map(([name, r]) => ({ name, diagrams: r.diagrams.size, calls: r.count,
    topCollections: Object.entries(r.byColl).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([c,v])=>`${c}:${v}`) }))
    .sort((a, b) => b.diagrams - a.diagrams);
  console.log(`ok=${ok} threw=${threw} skipped=${skipped}`);
  console.log('Top unresolved:'); for (const u of unknownList.slice(0,30)) console.log(`  ${String(u.diagrams).padStart(4)}  ${u.name}  ${u.topCollections.join(' ')}`);
} else {
  runDriver().catch(e => { console.error(e); process.exit(1); });
}
