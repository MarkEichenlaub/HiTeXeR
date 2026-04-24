'use strict';
// Render one id through HiTeXeR, rasterize, compute SSIM vs texer_pngs.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

async function renderSvgToPng(svgText) {
  // use sharp directly
  const buf = await sharp(Buffer.from(svgText), { density: 144 }).png().toBuffer();
  return sharp(buf).raw().toBuffer({ resolveWithObject: true });
}

function toRGBA(buf, w, h, channels) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  if (channels === 4) {
    for (let i = 0; i < w*h*4; i++) rgba[i] = buf[i];
  } else {
    for (let i = 0; i < w*h; i++) {
      rgba[i*4]=buf[i*channels];
      rgba[i*4+1]=buf[i*channels+1];
      rgba[i*4+2]=buf[i*channels+2];
      rgba[i*4+3]=255;
    }
  }
  return rgba;
}

async function main(id) {
  global.window = {};
  global.document = { createElement: () => ({ getContext: () => null }) };
  require('./asy-interp.js');
  const src = fs.readFileSync(`comparison/asy_src/${id}.asy`, 'utf8');
  const r = window.AsyInterp.render(src, { format: 'svg' });
  const svg = typeof r === 'string' ? r : r.svg;
  fs.writeFileSync(`_ssim_${id}.svg`, svg);
  // Rasterize
  const htxRaw = await renderSvgToPng(svg);
  const htxW = htxRaw.info.width, htxH = htxRaw.info.height;
  const texerPath = `comparison/texer_pngs/${id}.png`;
  const texerRaw = await sharp(texerPath).raw().toBuffer({ resolveWithObject: true });
  const texerW = texerRaw.info.width, texerH = texerRaw.info.height;
  // Resize htx to match texer dims for fair SSIM comparison (as in pipeline)
  const maxDim = 400;
  const scale = Math.min(1, maxDim / Math.max(texerW, texerH));
  const rw = Math.round(texerW * scale), rh = Math.round(texerH * scale);
  const htxResized = await sharp(Buffer.from(svg), { density: 144 })
    .resize(rw, rh, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const texerResized = await sharp(texerPath)
    .resize(rw, rh, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const htxRgba = toRGBA(htxResized.data, rw, rh, htxResized.info.channels);
  const texerRgba = toRGBA(texerResized.data, rw, rh, texerResized.info.channels);
  const s = computeSSIM({ data: htxRgba, width: rw, height: rh },
                         { data: texerRgba, width: rw, height: rh });
  // sizeScore
  const SIGMA = 0.15;
  const wRatio = htxW / texerW, hRatio = htxH / texerH;
  const sizeScore = Math.exp(-((wRatio-1)**2 + (hRatio-1)**2) / (2*SIGMA*SIGMA));
  const combined = (s.mssim + sizeScore) / 2;
  console.log(id, 'htx=', htxW,'x',htxH,'texer=',texerW,'x',texerH,
    'ssim=', s.mssim.toFixed(4), 'size=', sizeScore.toFixed(4),
    'combined=', combined.toFixed(4));
}

const ids = process.argv.slice(2);
(async () => {
  for (const id of ids) {
    try { await main(id); } catch (e) { console.log(id, 'ERR', e.message); }
  }
})();
