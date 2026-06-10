// Survey corpus size-match state: htx vs texer dims, cross-referenced with source features.
const fs = require('fs');
const path = require('path');
const R = require('./comparison/ssim-results.json');

const SRC = path.join(__dirname, 'comparison', 'asy_src');

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function features(code) {
  const c = stripComments(code);
  const f = {};
  f.hasSize = /\bsize\s*\(/.test(c);
  f.hasUnitsize = /\bunitsize\s*\(/.test(c);
  f.hasImportGraph = /\bimport\s+graph/.test(c);
  f.hasAxis = /\b[xy]axis\s*\(/.test(c) || /\baxes\s*\(/.test(c);
  f.hasCurrentpicMul = /currentpicture\s*=[^;]*\*\s*currentpicture/.test(c);
  f.hasAddPic = /\badd\s*\(/.test(c) && /\bpicture\b/.test(c);
  // path label: draw("...", path...) or draw(Label(...), path)
  f.hasPathLabelStr = /\bdraw\s*\(\s*(?:Label\s*\(|rotate\s*\([^)]*\)\s*\*\s*)?"/.test(c) || /\bdraw\s*\(\s*\$/.test(c);
  f.hasLabel = /\blabel\s*\(/.test(c);
  f.is3D = /\bimport\s+(three|solids|graph3|grid3)\b/.test(c);
  return f;
}

const out = { tot: 0, noRef: 0, classes: {}, rows: [] };
const classCounts = { ok: 0, aspect: 0, big: 0, small: 0, weird: 0 };
const byFeature = {};

const TOL = 0.07; // 7%

for (const e of R) {
  if (!e.refDims || !e.htxDims || !e.refDims[0] || !e.htxDims[0]) { out.noRef++; continue; }
  out.tot++;
  const wR = e.wRatio, hR = e.hRatio;
  const aspR = wR / hR; // htx aspect / ref aspect
  let cls;
  const wOk = Math.abs(wR - 1) <= TOL, hOk = Math.abs(hR - 1) <= TOL;
  if (wOk && hOk) cls = 'ok';
  else if (Math.abs(aspR - 1) > TOL) cls = 'aspect';
  else if (wR > 1 + TOL) cls = 'big';
  else if (wR < 1 - TOL) cls = 'small';
  else cls = 'weird';
  classCounts[cls]++;

  let feat = null;
  try {
    const code = fs.readFileSync(path.join(SRC, e.id + '.asy'), 'utf8');
    feat = features(code);
  } catch (err) { /* missing src */ }

  if (feat) {
    const sizing = feat.hasSize && feat.hasUnitsize ? 'size+unit' :
      feat.hasSize ? 'size' : feat.hasUnitsize ? 'unitsize' : 'bare';
    const key = sizing + (feat.is3D ? '/3D' : '');
    byFeature[key] = byFeature[key] || { ok: 0, aspect: 0, big: 0, small: 0, weird: 0, n: 0, refLong: [] };
    byFeature[key][cls]++;
    byFeature[key].n++;
    byFeature[key].refLong.push(Math.max(e.refDims[0], e.refDims[1]));
    out.rows.push({ id: e.id, cls, wR: +wR.toFixed(3), hR: +hR.toFixed(3), sizing: key, refDims: e.refDims, htxDims: e.htxDims });
  }
}

console.log('total scored:', out.tot, ' (no dims:', out.noRef + ')');
console.log('classes:', JSON.stringify(classCounts));
console.log('\nBy sizing feature:');
for (const k of Object.keys(byFeature).sort()) {
  const v = byFeature[k];
  const lon = v.refLong.slice().sort((a, b) => a - b);
  const q = p => lon[Math.floor(p * (lon.length - 1))];
  console.log(`${k.padEnd(14)} n=${String(v.n).padStart(5)}  ok=${String(v.ok).padStart(5)} aspect=${String(v.aspect).padStart(4)} big=${String(v.big).padStart(4)} small=${String(v.small).padStart(4)} weird=${String(v.weird).padStart(3)}  refLong p25/50/75/90=${q(.25)}/${q(.5)}/${q(.75)}/${q(.9)}`);
}

fs.writeFileSync('_size_survey.json', JSON.stringify(out.rows, null, 0));
console.log('\nwrote _size_survey.json');
