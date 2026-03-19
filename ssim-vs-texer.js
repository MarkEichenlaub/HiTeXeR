'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const HTX_DIR = 'comparison/htx_pngs';
const TEXER_DIR = 'comparison/texer_pngs';
const MAX = 400;

const testIds = ['05616','05632','05666'];

async function computePairSSIM(refPath, htxPath) {
  const refMeta = await sharp(refPath).metadata();
  const htxMeta = await sharp(htxPath).metadata();

  const refScale = Math.min(MAX / refMeta.width, MAX / refMeta.height, 1);
  const refW = Math.round(refMeta.width * refScale);
  const refH = Math.round(refMeta.height * refScale);

  const htxScale = Math.min(MAX / htxMeta.width, MAX / htxMeta.height, 1);
  const htxW = Math.round(htxMeta.width * htxScale);
  const htxH = Math.round(htxMeta.height * htxScale);

  const canvasW = Math.max(refW, htxW, 8);
  const canvasH = Math.max(refH, htxH, 8);

  const refBuf = await sharp(refPath).flatten({ background: { r:255,g:255,b:255 } })
    .resize(refW, refH, { fit: 'fill' })
    .extend({ top: Math.round((canvasH-refH)/2), bottom: canvasH-refH-Math.round((canvasH-refH)/2),
              left: Math.round((canvasW-refW)/2), right: canvasW-refW-Math.round((canvasW-refW)/2),
              background: { r:255,g:255,b:255 } })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const htxBuf = await sharp(htxPath).flatten({ background: { r:255,g:255,b:255 } })
    .resize(htxW, htxH, { fit: 'fill' })
    .extend({ top: Math.round((canvasH-htxH)/2), bottom: canvasH-htxH-Math.round((canvasH-htxH)/2),
              left: Math.round((canvasW-htxW)/2), right: canvasW-htxW-Math.round((canvasW-htxW)/2),
              background: { r:255,g:255,b:255 } })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const w = refBuf.info.width, h = refBuf.info.height;
  function toRGBA(buf, width, height) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i*4]=buf[i*3]; rgba[i*4+1]=buf[i*3+1]; rgba[i*4+2]=buf[i*3+2]; rgba[i*4+3]=255;
    }
    return rgba;
  }
  const refImg = { data: toRGBA(refBuf.data,w,h), width: w, height: h };
  const htxImg = { data: toRGBA(htxBuf.data,w,h), width: w, height: h };
  const { mssim } = computeSSIM(refImg, htxImg);
  return { mssim, refDims: refMeta.width+'x'+refMeta.height, htxDims: htxMeta.width+'x'+htxMeta.height, canvasW, canvasH };
}

async function main() {
  for (const id of testIds) {
    const texerPath = path.join(TEXER_DIR, id + '.png');
    const htxPath = path.join(HTX_DIR, id + '.png');
    if (!fs.existsSync(texerPath)) { console.log(id + ': no texer PNG'); continue; }
    if (!fs.existsSync(htxPath)) { console.log(id + ': no htx PNG'); continue; }
    const r = await computePairSSIM(texerPath, htxPath);
    console.log(id + ': SSIM_vs_texer=' + r.mssim.toFixed(4) + '  texer=' + r.refDims + '  htx=' + r.htxDims + '  canvas=' + r.canvasW + 'x' + r.canvasH);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
