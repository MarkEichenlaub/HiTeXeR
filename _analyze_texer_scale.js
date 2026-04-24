'use strict';
// Figure out what "bp size" TeXeR renders for various diagrams,
// so we know what to target for tiny-unitsize boost.
const fs = require('fs');
const path = require('path');

global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;

function pngDim(p){ const b=fs.readFileSync(p); return {w:b.readUInt32BE(16),h:b.readUInt32BE(20)}; }

function render(id) {
  const asyPath = `comparison/asy_src/${id}.asy`;
  const raw = fs.readFileSync(asyPath, 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';
  const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
  const iwM = r.svg.match(/data-intrinsic-w="([^"]+)"/);
  const ihM = r.svg.match(/data-intrinsic-h="([^"]+)"/);
  const vbM = r.svg.match(/viewBox="([^"]+)"/);
  const iw = parseFloat(iwM?.[1] || 0);
  const ih = parseFloat(ihM?.[1] || 0);
  const vb = vbM ? vbM[1].split(/\s+/).map(Number) : [0,0,0,0];
  // intrinsic is in CSS-px at 120dpi; bp = intrinsic * 72/120 = intrinsic * 0.6
  const bpW = iw * 72/120;
  const bpH = ih * 72/120;
  return { iw, ih, bpW, bpH, vbW: vb[2], vbH: vb[3] };
}

// IDs to analyze: a mix across the corpus.
// Include some 077xx (tiny unitsize) and some known-good with regular sizes.
const samples = [
  // 077xx cluster (tiny unitsize, currently too big):
  '07710','07718','07696','07697','07716','07715','07708','07709','07706','07663',
  '07729','07730','07712','07713','07714','07717','07664',
  // 04xxx cluster (mentioned in rescore):
  '04086','04087','04089','04818','04819','04820',
  // 03xxx cluster:
  '03895','03896','03900','03904','03910','03911',
  // 00 cluster:
  '00254','00015','00025','00026','00357','00448',
  // 117xx, 087xx, 099xx, 11xxx (other low-ssim):
  '07727','07728','08500','08587','08588','09093','09838','11414','11415','11416','11417',
  // Known-good high-scoring diagrams (sanity check):
  '03700','10503','08805','06252','06253','09457','09343','06859','05467',
  '12274','05896','04086','01196','01530','00111','03491'
];

const rows = [];
for (const id of samples) {
  const refP = `comparison/texer_pngs/${id}.png`;
  const asyP = `comparison/asy_src/${id}.asy`;
  if (!fs.existsSync(refP) || !fs.existsSync(asyP)) continue;
  const t = pngDim(refP);
  let h;
  try { h = render(id); } catch(e) { continue; }
  // Estimate TeXeR bp. We don't know exact DPI, but if we assume
  // the "target bp" for well-matched diagrams is roughly t.w/(2*120/72)
  // (since ssim-pipeline says htx-svg-px=bp*120/72 and rasterize at 144dpi
  // makes png-px = svg-px * 144/72 = bp*120/72*2 = bp*3.333, and known
  // good wR≈0.5 means TeXeR png-px = 2*htx-png-px = bp*6.667, so
  // TeXeR assumed DPI == 480, and TeXeR_bp = t.w/(480/72) = t.w*72/480 = t.w*0.15).
  const texerBpW = t.w * 72/480;
  const texerBpH = t.h * 72/480;
  const srcRaw = fs.readFileSync(asyP, 'utf8');
  const unitMatch = srcRaw.match(/\bunitsize\s*\(([^)]+)\)/);
  const sizeMatch = srcRaw.match(/\bsize\s*\(([^)]+)\)/);
  rows.push({ id, texerPx:`${t.w}x${t.h}`, texerBp:`${texerBpW.toFixed(0)}x${texerBpH.toFixed(0)}`,
    htxBp:`${h.bpW.toFixed(0)}x${h.bpH.toFixed(0)}`,
    htxPx:`${h.iw.toFixed(0)}x${h.ih.toFixed(0)}`,
    bpRatio: (h.bpW/texerBpW).toFixed(2)+'x',
    unitSize: unitMatch?unitMatch[1].trim():'-',
    size: sizeMatch?sizeMatch[1].trim():'-' });
}

rows.sort((a,b) => parseFloat(b.bpRatio) - parseFloat(a.bpRatio));
console.log('id       texerPx       texerBp      htxBp         htxPx          bpRatio  unitsize     size');
for (const r of rows)
  console.log(r.id.padEnd(8), r.texerPx.padEnd(13), r.texerBp.padEnd(12), r.htxBp.padEnd(13), r.htxPx.padEnd(14), r.bpRatio.padEnd(8), r.unitSize.padEnd(12), r.size);
