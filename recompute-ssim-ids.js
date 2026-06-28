'use strict';
/**
 * recompute-ssim-ids.js  —  surgically recompute the SSIM/combined score for a
 * specific set of diagram ids and merge the new rows into comparison/ssim-results.json
 * (replacing the matching ids, re-sorting by combined). Mirrors the per-pair logic
 * in ssim-pipeline.js's _ssimWorker EXACTLY so the patched scores stay comparable
 * to the rest of the file — without recomputing all ~13k pairs.
 *
 * Use after replacing a single texer_pngs/<id>.png or htx_pngs/<id>.png.
 *
 *   node recompute-ssim-ids.js 12934 [moreIds...]
 */
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT      = __dirname;
const COMP      = path.join(ROOT, 'comparison');
const TEXER_DIR = path.join(COMP, 'texer_pngs');
const HTX_DIR   = path.join(COMP, 'htx_pngs');
const SSIM_FILE = path.join(COMP, 'ssim-results.json');
const IDS_FILE  = path.join(COMP, 'corpus-ids.json');

let allFiles = [];
try { allFiles = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch {}

function rgbToRgba(buf, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4]     = buf[i * 3];
    rgba[i * 4 + 1] = buf[i * 3 + 1];
    rgba[i * 4 + 2] = buf[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

async function scoreOne(id) {
  const idx = parseInt(id, 10) - 1;
  const corpusFile = allFiles[idx] || id;
  try {
    const refMeta = await sharp(path.join(TEXER_DIR, id + '.png')).metadata();
    const htxMeta = await sharp(path.join(HTX_DIR, id + '.png')).metadata();
    const aw = refMeta.width || 1, ah = refMeta.height || 1;
    const hw = htxMeta.width || 1, hh = htxMeta.height || 1;
    const MIN_DIM = 8;
    if (aw < MIN_DIM || ah < MIN_DIM || hw < MIN_DIM || hh < MIN_DIM) {
      return { id, idx, corpusFile, ssim: -1, sizeScore: -1, combined: -1, error: 'Image too small',
        wRatio: hw / aw, hRatio: hh / ah, refDims: [aw, ah], htxDims: [hw, hh] };
    }
    const wRatio = hw / aw, hRatio = hh / ah;
    const SIGMA = 0.15;
    let sizeScore;
    if (aw < 100 && ah < 100) sizeScore = 1.0;
    else {
      const maxRatio = Math.max(hw, hh) / Math.max(aw, ah);
      sizeScore = Math.exp(-((maxRatio - 1) ** 2) / (2 * SIGMA * SIGMA));
    }
    const MAX = 400;
    const trimRef = await sharp(path.join(TEXER_DIR, id + '.png'))
      .flatten({ background: { r: 255, g: 255, b: 255 } }).trim({ threshold: 20 })
      .toBuffer({ resolveWithObject: true });
    const trimHtx = await sharp(path.join(HTX_DIR, id + '.png'))
      .flatten({ background: { r: 255, g: 255, b: 255 } }).trim({ threshold: 20 })
      .toBuffer({ resolveWithObject: true });
    const maxW = Math.max(trimRef.info.width, trimHtx.info.width);
    const maxH = Math.max(trimRef.info.height, trimHtx.info.height);
    const scale = Math.min(MAX / maxW, MAX / maxH, 1);
    const targetW = Math.max(Math.round(maxW * scale), 11);
    const targetH = Math.max(Math.round(maxH * scale), 11);
    const refBuf = await sharp(trimRef.data)
      .resize(targetW, targetH, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let htxBuf = await sharp(trimHtx.data)
      .resize(targetW, targetH, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = refBuf.info.width, h = refBuf.info.height;
    if (htxBuf.info.width !== w || htxBuf.info.height !== h) {
      htxBuf = await sharp(htxBuf.data, { raw: { width: htxBuf.info.width, height: htxBuf.info.height, channels: 3 } })
        .resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    }
    const refImg = { data: rgbToRgba(refBuf.data, w, h), width: w, height: h };
    const htxImg = { data: rgbToRgba(htxBuf.data, w, h), width: w, height: h };
    const { mssim: rawSsim } = computeSSIM(refImg, htxImg);
    const minDim = Math.min(w, h);
    const softSigmaA = Math.min(Math.max(minDim * 0.025, 1.5), 4);
    const softSigmaB = Math.min(Math.max(minDim * 0.08, 3), 10);
    async function ssimBlurred(sigma) {
      const refS = await sharp(refBuf.data, { raw: { width: w, height: h, channels: 3 } }).blur(sigma).raw().toBuffer();
      const htxS = await sharp(htxBuf.data, { raw: { width: w, height: h, channels: 3 } }).blur(sigma).raw().toBuffer();
      return computeSSIM({ data: rgbToRgba(refS, w, h), width: w, height: h },
        { data: rgbToRgba(htxS, w, h), width: w, height: h }).mssim;
    }
    const softSsim = Math.max(await ssimBlurred(softSigmaA), await ssimBlurred(softSigmaB));
    const mssim = Math.max(rawSsim, softSsim);
    return { id, idx, corpusFile, ssim: mssim, rawSsim, softSsim, sizeScore, combined: mssim * sizeScore,
      wRatio, hRatio, refDims: [aw, ah], htxDims: [hw, hh] };
  } catch (e) {
    return { id, idx, corpusFile, ssim: -1, sizeScore: -1, combined: -1, error: e.message };
  }
}

(async () => {
  const ids = process.argv.slice(2);
  if (!ids.length) { console.error('usage: node recompute-ssim-ids.js <id> [id...]'); process.exit(1); }
  const results = JSON.parse(fs.readFileSync(SSIM_FILE, 'utf8'));
  const byId = new Map(results.map((r, i) => [r.id, i]));
  for (const id of ids) {
    const row = await scoreOne(id);
    if (byId.has(id)) { results[byId.get(id)] = row; }
    else { results.push(row); byId.set(id, results.length - 1); }
    console.log(`#${id}: combined=${row.combined.toFixed(4)} ssim=${row.ssim.toFixed(4)} size=${row.sizeScore.toFixed(4)}${row.error ? ' ' + row.error : ''}  refDims=${row.refDims} htxDims=${row.htxDims}`);
  }
  results.sort((a, b) => a.combined - b.combined);
  fs.writeFileSync(SSIM_FILE, JSON.stringify(results, null, 2));
  console.log(`Merged ${ids.length} id(s) into ${path.relative(ROOT, SSIM_FILE)} (${results.length} rows).`);
})();
