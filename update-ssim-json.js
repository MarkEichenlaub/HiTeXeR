'use strict';
// Update ssim-results.json with newly computed scores for specific IDs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const HTX_DIR = 'comparison/htx_pngs';
const ASY_DIR = 'comparison/asy_pngs';
const MAX = 400;
const SIGMA = 0.15;

// IDs whose SVGs changed and need updated scores
const updateIds = new Set(['05616','05632','05666']);

function toRGBA(buf, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i*4]=buf[i*3]; rgba[i*4+1]=buf[i*3+1]; rgba[i*4+2]=buf[i*3+2]; rgba[i*4+3]=255;
  }
  return rgba;
}

async function computeMetricsForPair(asyPath, htxPath) {
  const asyMeta = await sharp(asyPath).metadata();
  const htxMeta = await sharp(htxPath).metadata();

  const aw = asyMeta.width || 1, ah = asyMeta.height || 1;
  const hw = htxMeta.width || 1, hh = htxMeta.height || 1;

  const MIN_DIM = 8;
  if (aw < MIN_DIM || ah < MIN_DIM || hw < MIN_DIM || hh < MIN_DIM) {
    return { ssim: -1, sizeScore: -1, combined: -1,
      wRatio: hw / aw, hRatio: hh / ah, asyDims: [aw, ah], htxDims: [hw, hh] };
  }

  // Dimension ratios & size score
  const wRatio = hw / aw;
  const hRatio = hh / ah;
  const sizeScore = Math.exp(-((wRatio - 1) ** 2 + (hRatio - 1) ** 2) / (2 * SIGMA * SIGMA));

  // Content SSIM: resize both to Asymptote's aspect at ≤400px
  const asyScale = Math.min(MAX / aw, MAX / ah, 1);
  const targetW = Math.max(Math.round(aw * asyScale), 11);
  const targetH = Math.max(Math.round(ah * asyScale), 11);

  const asyBuf = await sharp(asyPath).flatten({ background: {r:255,g:255,b:255} })
    .resize(targetW, targetH, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const htxBuf = await sharp(htxPath).flatten({ background: {r:255,g:255,b:255} })
    .resize(targetW, targetH, { fit: 'fill' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const w = asyBuf.info.width, h = asyBuf.info.height;
  const asyImg = { data: toRGBA(asyBuf.data,w,h), width: w, height: h };
  const htxImg = { data: toRGBA(htxBuf.data,w,h), width: w, height: h };
  const { mssim } = computeSSIM(asyImg, htxImg);
  const combined = mssim * sizeScore;

  return { ssim: mssim, sizeScore, combined, wRatio, hRatio, asyDims: [aw, ah], htxDims: [hw, hh] };
}

async function main() {
  const resultsPath = 'comparison/ssim-results.json';
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

  let updated = 0;
  for (const r of results) {
    if (!updateIds.has(r.id)) continue;
    const asyPath = path.join(ASY_DIR, r.id + '.png');
    const htxPath = path.join(HTX_DIR, r.id + '.png');
    if (!fs.existsSync(asyPath) || !fs.existsSync(htxPath)) continue;
    const oldCombined = r.combined != null ? r.combined : r.ssim;
    const metrics = await computeMetricsForPair(asyPath, htxPath);
    Object.assign(r, metrics);
    delete r.error;
    console.log(r.id + ': combined ' + oldCombined.toFixed(4) + ' -> ' + r.combined.toFixed(4) +
      ' (ssim=' + r.ssim.toFixed(4) + ' size=' + r.sizeScore.toFixed(4) + ') (' + r.corpusFile + ')');
    updated++;
  }

  // Re-sort by combined
  results.sort((a, b) => (a.combined != null ? a.combined : a.ssim) - (b.combined != null ? b.combined : b.ssim));
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log('Updated ' + updated + ' entries and re-sorted ssim-results.json');
}

main().catch(e => { console.error(e); process.exit(1); });
