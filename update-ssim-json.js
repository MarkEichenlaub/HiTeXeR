'use strict';
// Update ssim-results.json with newly computed scores for specific IDs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const HTX_DIR = 'comparison/htx_pngs';
const ASY_DIR = 'comparison/asy_pngs';
const MAX = 400;

// IDs whose SVGs changed and need updated scores
const updateIds = new Set(['05616','05632','05666']);

async function computeSSIMForPair(asyPath, htxPath) {
  const asyMeta = await sharp(asyPath).metadata();
  const htxMeta = await sharp(htxPath).metadata();

  const MIN_DIM = 8;
  if ((asyMeta.width||0) < MIN_DIM || (asyMeta.height||0) < MIN_DIM ||
      (htxMeta.width||0) < MIN_DIM || (htxMeta.height||0) < MIN_DIM) {
    return -1;
  }

  const asyScale = Math.min(MAX / asyMeta.width, MAX / asyMeta.height, 1);
  const asyW = Math.round(asyMeta.width * asyScale);
  const asyH = Math.round(asyMeta.height * asyScale);

  const htxScale = Math.min(MAX / htxMeta.width, MAX / htxMeta.height, 1);
  const htxW = Math.round(htxMeta.width * htxScale);
  const htxH = Math.round(htxMeta.height * htxScale);

  const canvasW = Math.max(asyW, htxW, 8);
  const canvasH = Math.max(asyH, htxH, 8);

  const asyBuf = await sharp(asyPath).flatten({ background: {r:255,g:255,b:255} })
    .resize(asyW, asyH, { fit: 'fill' })
    .extend({ top: Math.round((canvasH-asyH)/2), bottom: canvasH-asyH-Math.round((canvasH-asyH)/2),
              left: Math.round((canvasW-asyW)/2), right: canvasW-asyW-Math.round((canvasW-asyW)/2),
              background: {r:255,g:255,b:255} })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const htxBuf = await sharp(htxPath).flatten({ background: {r:255,g:255,b:255} })
    .resize(htxW, htxH, { fit: 'fill' })
    .extend({ top: Math.round((canvasH-htxH)/2), bottom: canvasH-htxH-Math.round((canvasH-htxH)/2),
              left: Math.round((canvasW-htxW)/2), right: canvasW-htxW-Math.round((canvasW-htxW)/2),
              background: {r:255,g:255,b:255} })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const w = asyBuf.info.width, h = asyBuf.info.height;
  function toRGBA(buf, width, height) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i*4]=buf[i*3]; rgba[i*4+1]=buf[i*3+1]; rgba[i*4+2]=buf[i*3+2]; rgba[i*4+3]=255;
    }
    return rgba;
  }
  const asyImg = { data: toRGBA(asyBuf.data,w,h), width: w, height: h };
  const htxImg = { data: toRGBA(htxBuf.data,w,h), width: w, height: h };
  const { mssim } = computeSSIM(asyImg, htxImg);
  return mssim;
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
    const oldSsim = r.ssim;
    r.ssim = await computeSSIMForPair(asyPath, htxPath);
    delete r.error;
    console.log(r.id + ': ' + oldSsim.toFixed(4) + ' -> ' + r.ssim.toFixed(4) + ' (' + r.corpusFile + ')');
    updated++;
  }

  // Re-sort by ssim
  results.sort((a, b) => a.ssim - b.ssim);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log('Updated ' + updated + ' entries and re-sorted ssim-results.json');
}

main().catch(e => { console.error(e); process.exit(1); });
