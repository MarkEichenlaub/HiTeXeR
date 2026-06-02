// auto-fix/size-audit.js
// READ-ONLY size-error audit over comparison/ssim-results.json.
// Classifies every scored diagram by its .asy size directive, then reports
// which directive categories carry the total-size tail (wRatio/hRatio far
// from 1.0). Does NOT render or modify anything.
//
// Usage:
//   node auto-fix/size-audit.js                 # summary + worst clusters
//   node auto-fix/size-audit.js --list size-cm  # dump failing ids in a category
//   node auto-fix/size-audit.js --thr 0.15      # deviation threshold (default 0.15)
//   node auto-fix/size-audit.js --ids 10765,11370,...   # just these ids
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SSIM_PATH    = path.join(ROOT, 'comparison', 'ssim-results.json');
const RANDOM_PATH  = path.join(ROOT, 'comparison', 'random-ids.json');
const ASY_SRC_DIR  = path.join(ROOT, 'comparison', 'asy_src');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const THR       = parseFloat(arg('--thr', '0.15'));
const LIST_CAT  = arg('--list', null);
const ONLY_IDS  = arg('--ids', null);
const onlySet   = ONLY_IDS ? new Set(ONLY_IDS.split(',').map(s => s.trim())) : null;

function loadRandom() {
  try { return new Set(JSON.parse(fs.readFileSync(RANDOM_PATH, 'utf8')).map(String)); }
  catch { return new Set(); }
}

// Classify a diagram by its dominant size directive.
function classify(asy) {
  if (!asy) return 'unknown';
  // strip line comments so commented-out directives don't count
  const src = asy.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const is3D = /\bsize3\s*\(/.test(src) || /import\s+three\b/.test(src) ||
               /\bcurrentprojection\b/.test(src);
  if (is3D) return '3D';
  // AoPS graph-template family:
  //   if(equalAxisRatio){ unitsize(overallSize); } else { size(...,IgnoreAspect); }
  // Only one branch is live; the dead unitsize must not win the static match.
  const eq = src.match(/\bbool\s+equalAxisRatio\s*=\s*(true|false)\b/);
  if (eq && /\bunitsize\s*\(/.test(src) && /\bsize\s*\(/.test(src))
    return eq[1] === 'true' ? 'unitsize-plain' : 'size';
  const um = src.match(/\bunitsize\s*\(\s*([^)]*)\)/);
  if (um) {
    const inside = um[1];
    // units may abut the number (e.g. 3cm, 0.7mm) so no leading \b
    if (/(cm|mm|inch(es)?|pt)\b/.test(inside)) return 'unitsize-cm';
    return 'unitsize-plain';
  }
  if (/\bsize\s*\(/.test(src)) return 'size';
  return 'auto';
}

function dev(r) {
  // worst-axis deviation from 1.0
  const w = r.wRatio, h = r.hRatio;
  const dw = (typeof w === 'number' && isFinite(w)) ? Math.abs(w - 1) : null;
  const dh = (typeof h === 'number' && isFinite(h)) ? Math.abs(h - 1) : null;
  if (dw == null && dh == null) return null;
  return Math.max(dw == null ? 0 : dw, dh == null ? 0 : dh);
}
function dir(r) {
  // signed: + too big, - too small (by geometric-mean ratio)
  const w = r.wRatio, h = r.hRatio;
  if (typeof w !== 'number' || typeof h !== 'number') return 0;
  const g = Math.sqrt(Math.max(w, 1e-6) * Math.max(h, 1e-6));
  return g - 1;
}

function median(a) {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function main() {
  const rows = JSON.parse(fs.readFileSync(SSIM_PATH, 'utf8'));
  const random = loadRandom();
  const cats = {}; // cat -> {all:[], fail:[]}
  const asyCache = new Map();

  for (const r of rows) {
    if (!r || !r.id) continue;
    if (onlySet && !onlySet.has(r.id)) continue;
    if (random.has(r.id)) continue;
    const d = dev(r);
    if (d == null) continue;
    let asy = asyCache.get(r.id);
    if (asy === undefined) {
      try { asy = fs.readFileSync(path.join(ASY_SRC_DIR, r.id + '.asy'), 'utf8'); }
      catch { asy = ''; }
      asyCache.set(r.id, asy);
    }
    const cat = classify(asy);
    if (!cats[cat]) cats[cat] = { all: [], fail: [] };
    const rec = { id: r.id, dev: d, dir: dir(r), w: r.wRatio, h: r.hRatio };
    cats[cat].all.push(rec);
    if (d > THR) cats[cat].fail.push(rec);
  }

  if (onlySet) {
    // per-id dump mode
    const flat = Object.entries(cats).flatMap(([c, v]) => v.all.map(r => ({ ...r, cat: c })));
    flat.sort((a, b) => b.dev - a.dev);
    for (const r of flat)
      console.log(`${r.id}  ${r.cat.padEnd(14)} w=${r.w?.toFixed(3)} h=${r.h?.toFixed(3)} dev=${r.dev.toFixed(3)} ${r.dir > 0 ? 'BIG' : 'small'}`);
    return;
  }

  if (LIST_CAT) {
    const v = cats[LIST_CAT];
    if (!v) { console.log('no such category: ' + LIST_CAT); return; }
    v.fail.sort((a, b) => b.dev - a.dev);
    console.log(`# ${LIST_CAT}: ${v.fail.length} failing (dev>${THR}) of ${v.all.length}`);
    for (const r of v.fail)
      console.log(`${r.id}  w=${r.w?.toFixed(3)} h=${r.h?.toFixed(3)} dev=${r.dev.toFixed(3)} ${r.dir > 0 ? 'BIG' : 'small'}`);
    return;
  }

  // summary
  const order = Object.keys(cats).sort((a, b) => cats[b].fail.length - cats[a].fail.length);
  let totAll = 0, totFail = 0, totBig = 0, totSmall = 0;
  console.log(`thr=${THR}  (dev = max|ratio-1| across w,h)\n`);
  console.log('category        n     fail   fail%   medDev  big   small');
  console.log('--------------  ----  -----  ------  ------  ----  -----');
  for (const c of order) {
    const v = cats[c];
    const big = v.fail.filter(r => r.dir > 0).length;
    const small = v.fail.length - big;
    const medDev = median(v.all.map(r => r.dev));
    totAll += v.all.length; totFail += v.fail.length; totBig += big; totSmall += small;
    console.log(
      c.padEnd(14) + '  ' +
      String(v.all.length).padStart(4) + '  ' +
      String(v.fail.length).padStart(5) + '  ' +
      (100 * v.fail.length / v.all.length).toFixed(1).padStart(5) + '%  ' +
      medDev.toFixed(3).padStart(6) + '  ' +
      String(big).padStart(4) + '  ' +
      String(small).padStart(5)
    );
  }
  console.log('--------------  ----  -----  ------  ------  ----  -----');
  console.log('TOTAL'.padEnd(14) + '  ' + String(totAll).padStart(4) + '  ' +
    String(totFail).padStart(5) + '  ' +
    (100 * totFail / totAll).toFixed(1).padStart(5) + '%  ' +
    '      ' + '  ' + String(totBig).padStart(4) + '  ' + String(totSmall).padStart(5));
  console.log(`\nTip: node auto-fix/size-audit.js --list <category>   to dump failing ids`);
}

main();
