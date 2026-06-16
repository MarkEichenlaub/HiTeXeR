'use strict';
// Recompute the harness-style SSIM for an already-rendered htx PNG vs a texer ref.
// Mirrors _regr_score.js score() (trim threshold 20, resize fill to <=400, ssim.js).
// Usage: node _score2.js <htxPng> <refPng>
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');
const MAXD = 400;
function toRgba(b, w, h) { const o = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { o[i * 4] = b[i * 3]; o[i * 4 + 1] = b[i * 3 + 1]; o[i * 4 + 2] = b[i * 3 + 2]; o[i * 4 + 3] = 255; } return o; }
(async () => {
  const [htxP, refP] = process.argv.slice(2);
  const tr = await sharp(refP).flatten({ background: { r: 255, g: 255, b: 255 } }).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  const th = await sharp(htxP).flatten({ background: { r: 255, g: 255, b: 255 } }).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  const mw = Math.max(tr.info.width, th.info.width), mh = Math.max(tr.info.height, th.info.height);
  const sc = Math.min(MAXD / mw, MAXD / mh, 1);
  const tw = Math.max(Math.round(mw * sc), 11), tht = Math.max(Math.round(mh * sc), 11);
  const rb = await sharp(tr.data).resize(tw, tht, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let hb = await sharp(th.data).resize(tw, tht, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = rb.info.width, h = rb.info.height;
  if (hb.info.width !== w || hb.info.height !== h) hb = await sharp(hb.data, { raw: { width: hb.info.width, height: hb.info.height, channels: 3 } }).resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const { mssim } = computeSSIM({ data: toRgba(rb.data, w, h), width: w, height: h }, { data: toRgba(hb.data, w, h), width: w, height: h });
  console.log(htxP.split(/[\\/]/).pop(), 'trimDims', th.info.width + 'x' + th.info.height, 'refTrim', tr.info.width + 'x' + tr.info.height, 'ssim', mssim.toFixed(4));
})();
