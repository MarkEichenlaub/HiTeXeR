// auto-fix/_auto-impact.js (throwaway)
// Memory-safe corpus measurement of the auto-category over-size fix.
// Renders every auto-classified id in CHUNKS via spawned node subprocesses
// (in-process rendering of all 1531 OOMs). Each worker prints id\tiw\tih.
// Then compares intrinsic*2 (= htx_png dims, validated exact) vs texer dims
// for the AFTER ratio, and against ssim-results.json for the BEFORE ratio.
// Reports: tail before/after, moved-toward-1.0, newly-broken (was ok -> small/big).
//
//   node auto-fix/_auto-impact.js            # full run (chunked)
//   node auto-fix/_auto-impact.js --worker   # internal: read ids on argv, emit dims
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ASY = path.join(ROOT, 'comparison', 'asy_src');
const SSIM = path.join(ROOT, 'comparison', 'ssim-results.json');
const RANDOM = path.join(ROOT, 'comparison', 'random-ids.json');

function classify(asy) {
  if (!asy) return 'unknown';
  const src = asy.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bsize3\s*\(/.test(src) || /import\s+three\b/.test(src) || /\bcurrentprojection\b/.test(src)) return '3D';
  const um = src.match(/\bunitsize\s*\(\s*([^)]*)\)/);
  if (um) { const i = um[1]; if (/\b(cm|mm)\b/.test(i) || /\binch(es)?\b/.test(i) || /\bpt\b/.test(i)) return 'unitsize-cm'; return 'unitsize-plain'; }
  if (/\bsize\s*\(/.test(src)) return 'size';
  return 'auto';
}

if (process.argv.includes('--worker')) {
  global.window = global.window || {};
  global.katex = require('katex');
  require(path.join(ROOT, 'asy-interp.js'));
  const A = global.window.AsyInterp;
  const ids = process.argv.slice(3); // node _auto-impact.js --worker id id id...
  for (const id of ids) {
    let asy;
    try { asy = fs.readFileSync(path.join(ASY, id + '.asy'), 'utf8'); } catch { console.log(id + '\tNOASY'); continue; }
    try {
      const r = A.render('[asy]\n' + asy + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} });
      const iw = parseFloat((r.svg.match(/data-intrinsic-w="([^"]+)"/) || [])[1]);
      const ih = parseFloat((r.svg.match(/data-intrinsic-h="([^"]+)"/) || [])[1]);
      console.log(id + '\t' + iw + '\t' + ih);
    } catch (e) { console.log(id + '\tERR'); }
  }
  return;
}

// driver
const { execFileSync } = require('child_process');
const random = new Set(JSON.parse(fs.readFileSync(RANDOM, 'utf8')).map(String));
const ssim = JSON.parse(fs.readFileSync(SSIM, 'utf8'));
const before = new Map(); // id -> {w,h refdims, wR,hR}
const autoIds = [];
for (const r of ssim) {
  if (!r || !r.id || random.has(r.id)) continue;
  let asy; try { asy = fs.readFileSync(path.join(ASY, r.id + '.asy'), 'utf8'); } catch { continue; }
  if (classify(asy) !== 'auto') continue;
  if (!r.refDims || !r.refDims[0]) continue;
  autoIds.push(r.id);
  before.set(r.id, { refW: r.refDims[0], refH: r.refDims[1], wR: r.wRatio, hR: r.hRatio });
}
console.error('auto ids to render: ' + autoIds.length);

const CHUNK = 30;
const after = new Map();
for (let i = 0; i < autoIds.length; i += CHUNK) {
  const chunk = autoIds.slice(i, i + CHUNK);
  let out = '';
  try {
    out = execFileSync(process.execPath, ['--max-old-space-size=4096', __filename, '--worker', ...chunk], { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch (e) {
    out = (e && e.stdout) ? e.stdout : '';
    console.error('worker partial at chunk ' + i + ' (' + out.split('\n').filter(Boolean).length + ' lines)');
  }
  for (const line of out.split('\n')) {
    const [id, iw, ih] = line.split('\t');
    if (!id || iw === 'NOASY' || iw === 'ERR' || iw === undefined) continue;
    after.set(id, { iw: parseFloat(iw), ih: parseFloat(ih) });
  }
  console.error('rendered ' + Math.min(i + CHUNK, autoIds.length) + '/' + autoIds.length);
}

function dev(wR, hR) { return Math.max(Math.abs(wR - 1), Math.abs(hR - 1)); }
let tailBefore = 0, tailAfter = 0, moved = 0, worsened = 0, newlyBroken = 0, fixed = 0, changed = 0;
const newBrokenIds = [], fixedIds = [];
for (const id of autoIds) {
  const b = before.get(id), a = after.get(id);
  if (!a) continue;
  const awR = (a.iw * 2) / b.refW, ahR = (a.ih * 2) / b.refH;
  const db = dev(b.wR, b.hR), da = dev(awR, ahR);
  if (db > 0.15) tailBefore++;
  if (da > 0.15) tailAfter++;
  if (Math.abs(da - db) > 0.005) changed++;
  if (da < db - 0.02) moved++;
  if (da > db + 0.02) worsened++;
  if (db > 0.15 && da <= 0.15) { fixed++; fixedIds.push(id); }
  if (db <= 0.15 && da > 0.15) { newlyBroken++; newBrokenIds.push(id + ' ' + awR.toFixed(2) + '/' + ahR.toFixed(2)); }
}
console.log('\n=== auto-category impact (' + after.size + ' rendered) ===');
console.log('tail (dev>0.15)  before=' + tailBefore + '  after=' + tailAfter + '  (delta ' + (tailAfter - tailBefore) + ')');
console.log('changed=' + changed + '  moved_toward_1=' + moved + '  worsened=' + worsened);
console.log('fixed(broken->ok)=' + fixed + '  newlyBroken(ok->broken)=' + newlyBroken);
if (newBrokenIds.length) console.log('\nNEWLY BROKEN:\n' + newBrokenIds.join('\n'));
