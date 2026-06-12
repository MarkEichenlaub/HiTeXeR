'use strict';
// Zoom comparison: crop a fractional region from ref and cur renders of an ID,
// upscale hugely (nearest-neighbor off, smooth), and stack side by side.
// usage: node _zoomcmp.js <id> <x0> <y0> <x1> <y1> [outName]
//   coords are FRACTIONS of width/height (0..1) measured on the ref image.
const fs = require('fs');
const sharp = require('sharp');

const [id, x0, y0, x1, y1, outName] = process.argv.slice(2);
const fx0 = +x0, fy0 = +y0, fx1 = +x1, fy1 = +y1;

(async () => {
  const out = [];
  let maxW = 0, totH = 10;
  for (const [f, tag] of [['comparison/texer_pngs/' + id + '.png', 'ref'], ['_lblprobe_out/' + id + '_cur.png', 'cur']]) {
    const img = sharp(f).flatten({ background: '#fff' });
    const meta = await img.metadata();
    const left = Math.round(meta.width * fx0), top = Math.round(meta.height * fy0);
    const w = Math.max(4, Math.round(meta.width * (fx1 - fx0))), h = Math.max(4, Math.round(meta.height * (fy1 - fy0)));
    const crop = await img.extract({ left, top, width: Math.min(w, meta.width - left), height: Math.min(h, meta.height - top) })
      .resize({ width: 600, kernel: 'mitchell' }).png().toBuffer();
    const cm = await sharp(crop).metadata();
    out.push({ buf: crop, h: cm.height, w: cm.width });
    maxW = Math.max(maxW, cm.width);
  }
  for (const o of out) totH += o.h + 10;
  const name = outName || ('zoom_' + id + '.png');
  await sharp({ create: { width: maxW + 20, height: totH, channels: 3, background: '#888' } })
    .composite(out.map((o, i) => ({ input: o.buf, left: 10, top: 10 + i * (out[0].h + 10) })))
    .png().toFile('_lblprobe_out/' + name);
  console.log('wrote _lblprobe_out/' + name, '(ref on top, cur below)');
})().catch(e => { console.error(e); process.exit(1); });
