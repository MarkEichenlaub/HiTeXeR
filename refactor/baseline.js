'use strict';
// Corpus regression harness. Renders every comparison/asy_src/*.asy with the
// current asy-interp.js and records {sha1 of SVG, ms, error} per id.
//   node refactor/baseline.js --out <file.json> [--ids a,b] [--limit N] [--workers N]
// Compare two runs with refactor/diff-runs.js.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'comparison', 'asy_src');

if (isMainThread) {
  const argv = process.argv.slice(2), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const out = arg('--out') || path.join(__dirname, 'run.json');
  let ids = arg('--ids') ? arg('--ids').split(',')
    : fs.readdirSync(SRC).filter(f => f.endsWith('.asy')).map(f => f.slice(0, -4)).sort();
  if (arg('--limit')) ids = ids.slice(0, +arg('--limit'));
  const nW = +(arg('--workers') || 7);
  const svgDir = arg('--svgdir');
  const results = {}; let next = 0, done = 0; const t0 = Date.now();
  const queue = ids.slice();
  let active = 0;
  function spawn() {
    const w = new Worker(__filename, { workerData: { svgDir } , resourceLimits: { maxOldGenerationSizeMb: 4096 } });
    active++;
    let cur = null, timer = null;
    const feed = () => {
      if (!queue.length) { w.terminate(); return; }
      cur = queue.shift();
      timer = setTimeout(() => { results[cur] = { err: 'TIMEOUT', ms: 60000 }; done++; w.terminate(); }, 60000);
      w.postMessage(cur);
    };
    w.on('message', r => { clearTimeout(timer); results[r.id] = r; delete r.id; done++;
      if (done % 500 === 0) process.stderr.write(`${done}/${ids.length} ${((Date.now()-t0)/1000).toFixed(0)}s\n`);
      feed(); });
    w.on('error', e => { clearTimeout(timer); if (cur && !results[cur]) { results[cur] = { err: 'WORKER: ' + String(e && e.message || e).slice(0, 200) }; done++; } });
    w.on('exit', () => { clearTimeout(timer); active--; if (queue.length) spawn(); else if (active === 0) finish(); });
    feed();
  }
  function finish() {
    const sorted = {}; for (const k of Object.keys(results).sort()) sorted[k] = results[k];
    fs.writeFileSync(out, JSON.stringify(sorted));
    const errs = Object.values(results).filter(r => r.err).length;
    const tot = Object.values(results).reduce((a, r) => a + (r.ms || 0), 0);
    console.log(`wrote ${out}: ${ids.length} ids, ${errs} errors, render ms total ${tot.toFixed(0)}, wall ${((Date.now()-t0)/1000).toFixed(0)}s`);
  }
  for (let i = 0; i < Math.min(nW, ids.length); i++) spawn();
} else {
  global.window = {};
  global.katex = require('katex');
  // Silence noisy console output from the interpreter.
  console.log = console.warn = console.info = () => {};
  require(path.join(ROOT, 'asy-interp.js'));
  const htxDoc = require(path.join(ROOT, 'htx-doc-render.js'));
  const A = global.window.AsyInterp;
  parentPort.on('message', id => {
    const src = fs.readFileSync(path.join(SRC, id + '.asy'), 'utf8');
    const t = process.hrtime.bigint();
    let svg = '', err = null;
    try {
      const r = htxDoc.isDocument(src)
        ? { svg: htxDoc.renderDocSVG(src, A, { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} }) }
        : A.render('[asy]\n' + src + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
      svg = r.svg || '';
      if (r.error) err = String(r.error).slice(0, 300);
    } catch (e) { err = 'THROW: ' + String(e && e.message || e).slice(0, 300); }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    if (workerData.svgDir && svg) fs.writeFileSync(path.join(workerData.svgDir, id + '.svg'), svg);
    parentPort.postMessage({ id, h: crypto.createHash('sha1').update(svg).digest('hex').slice(0, 16), ms: Math.round(ms * 10) / 10, len: svg.length, err });
  });
}
