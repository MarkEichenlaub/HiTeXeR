// auto-fix/_live-probe.js (throwaway)
// Ground-truth size probe that does NOT trust ssim-results.json htxDims (stale).
// Live-renders each id via AsyInterp -> intrinsic*2 (== htx_png dims, exact) and
// compares against the ACTUAL texer_pngs/<id>.png dimensions for wR/hR.
// Memory-safe: renders in CHUNK subprocesses (asy-interp accumulates module
// state and OOMs in-process over hundreds of renders).
//
//   node auto-fix/_live-probe.js @idfile        # one id per line, # comments ok
//   node auto-fix/_live-probe.js id,id,id
//   node auto-fix/_live-probe.js --worker id id  # internal
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ASY = path.join(ROOT, 'comparison', 'asy_src');
const TEXER = path.join(ROOT, 'comparison', 'texer_pngs');

function pngSize(file) {
  // read IHDR width/height from PNG header (no sharp dependency in worker)
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } finally { fs.closeSync(fd); }
}

if (process.argv.includes('--worker')) {
  global.window = global.window || {};
  global.katex = require('katex');
  require(path.join(ROOT, 'asy-interp.js'));
  const A = global.window.AsyInterp;
  const ids = process.argv.slice(3);
  for (const id of ids) {
    let asy;
    try { asy = fs.readFileSync(path.join(ASY, id + '.asy'), 'utf8'); } catch { console.log(id + '\tNOASY'); continue; }
    let iw, ih;
    try {
      const r = A.render('[asy]\n' + asy + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} });
      iw = parseFloat((r.svg.match(/data-intrinsic-w="([^"]+)"/) || [])[1]);
      ih = parseFloat((r.svg.match(/data-intrinsic-h="([^"]+)"/) || [])[1]);
    } catch (e) { console.log(id + '\tERR'); continue; }
    let tw, th;
    try { const s = pngSize(path.join(TEXER, id + '.png')); tw = s.w; th = s.h; } catch { console.log(id + '\tNOTEXER'); continue; }
    const wR = (iw * 2) / tw, hR = (ih * 2) / th;
    console.log(id + '\t' + wR.toFixed(3) + '\t' + hR.toFixed(3));
  }
  return;
}

// driver
const { execFileSync } = require('child_process');
function loadIds(arg) {
  if (arg && arg.startsWith('@'))
    return fs.readFileSync(arg.slice(1), 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  return (arg || '').split(',').map(s => s.trim()).filter(Boolean);
}
const ids = loadIds(process.argv[2]);
const CHUNK = 30;
const out = [];
for (let i = 0; i < ids.length; i += CHUNK) {
  const chunk = ids.slice(i, i + CHUNK);
  let txt = '';
  try {
    txt = execFileSync(process.execPath, ['--max-old-space-size=4096', __filename, '--worker', ...chunk], { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch (e) { txt = (e && e.stdout) ? e.stdout : ''; console.error('worker partial at ' + i); }
  for (const line of txt.split('\n')) { if (line.trim()) out.push(line); }
  console.error('probed ' + Math.min(i + CHUNK, ids.length) + '/' + ids.length);
}
// emit: id wR hR  + tail summary
const fails = [];
for (const line of out) {
  const [id, wR, hR] = line.split('\t');
  console.log(line);
  if (wR === 'NOASY' || wR === 'ERR' || wR === 'NOTEXER' || wR === undefined) continue;
  const dev = Math.max(Math.abs(parseFloat(wR) - 1), Math.abs(parseFloat(hR) - 1));
  if (dev > 0.15) fails.push({ id, wR: parseFloat(wR), hR: parseFloat(hR), dev });
}
fails.sort((a, b) => b.dev - a.dev);
console.error('\n=== LIVE fails (dev>0.15): ' + fails.length + ' of ' + out.length + ' probed ===');
for (const f of fails) console.error(f.id + '\t' + f.wR.toFixed(3) + '\t' + f.hR.toFixed(3) + '\t' + (f.wR > 1 || f.hR > 1 ? 'BIG' : 'small'));
