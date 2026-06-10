// After-state size survey straight from PNG headers (ssim-results.json's
// wRatio/hRatio fields are not refreshed by render-and-score).
const fs = require('fs');
const path = require('path');
const REF = path.join(__dirname, 'comparison', 'texer_pngs');
const HTX = path.join(__dirname, 'comparison', 'htx_pngs');
const SRC = path.join(__dirname, 'comparison', 'asy_src');

function dims(f) { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

const TOL = 0.07;
const classCounts = { ok: 0, aspect: 0, big: 0, small: 0, weird: 0 };
const byFeature = {};
const rows = [];
let tot = 0, missing = 0;

for (const f of fs.readdirSync(REF)) {
  if (!f.endsWith('.png')) continue;
  const id = f.slice(0, -4);
  let r, h;
  try { r = dims(path.join(REF, f)); h = dims(path.join(HTX, f)); } catch (e) { missing++; continue; }
  if (!r[0] || !h[0]) { missing++; continue; }
  tot++;
  const wR = h[0] / r[0], hR = h[1] / r[1];
  const aspR = wR / hR;
  let cls;
  const wOk = Math.abs(wR - 1) <= TOL, hOk = Math.abs(hR - 1) <= TOL;
  if (wOk && hOk) cls = 'ok';
  else if (Math.abs(aspR - 1) > TOL) cls = 'aspect';
  else if (wR > 1 + TOL) cls = 'big';
  else if (wR < 1 - TOL) cls = 'small';
  else cls = 'weird';
  classCounts[cls]++;
  let key = '?';
  try {
    const c = stripComments(fs.readFileSync(path.join(SRC, id + '.asy'), 'utf8'));
    const hasSize = /\bsize\s*\(/.test(c), hasUnit = /\bunitsize\s*\(/.test(c);
    const is3D = /\bimport\s+(three|solids|graph3|grid3)\b/.test(c);
    key = (hasSize && hasUnit ? 'size+unit' : hasSize ? 'size' : hasUnit ? 'unitsize' : 'bare') + (is3D ? '/3D' : '');
  } catch (e) {}
  byFeature[key] = byFeature[key] || { ok: 0, aspect: 0, big: 0, small: 0, weird: 0, n: 0 };
  byFeature[key][cls]++; byFeature[key].n++;
  rows.push({ id, cls, wR: +wR.toFixed(3), hR: +hR.toFixed(3), key });
}
console.log('total compared:', tot, '(missing:', missing + ')');
console.log('classes:', JSON.stringify(classCounts));
console.log('ok fraction:', (classCounts.ok / tot * 100).toFixed(1) + '%');
console.log('\nBy sizing feature:');
for (const k of Object.keys(byFeature).sort()) {
  const v = byFeature[k];
  console.log(`${k.padEnd(14)} n=${String(v.n).padStart(5)}  ok=${String(v.ok).padStart(5)} aspect=${String(v.aspect).padStart(4)} big=${String(v.big).padStart(4)} small=${String(v.small).padStart(4)} weird=${String(v.weird).padStart(3)}`);
}
fs.writeFileSync('_size_survey_after.json', JSON.stringify(rows));
console.log('\nwrote _size_survey_after.json');
