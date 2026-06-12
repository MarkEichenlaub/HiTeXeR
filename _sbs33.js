'use strict';
// Side-by-side composites: ref (left) vs current render (right), normalized to
// equal height, for quick visual triage. Output _lblprobe_out/sbs_<id>.png
const fs = require('fs');
const sharp = require('sharp');

const IDS = process.argv.slice(2);
(async () => {
  for (const id of IDS) {
    try {
      const refF = 'comparison/texer_pngs/' + id + '.png';
      const curF = '_lblprobe_out/' + id + '_cur.png';
      const H = 300;
      const ref = await sharp(refF).flatten({ background: '#fff' }).resize({ height: H }).toBuffer();
      const cur = await sharp(curF).flatten({ background: '#fff' }).resize({ height: H }).toBuffer();
      const rm = await sharp(ref).metadata();
      const cm = await sharp(cur).metadata();
      const W = rm.width + cm.width + 30;
      await sharp({ create: { width: W, height: H + 20, channels: 3, background: '#ddd' } })
        .composite([
          { input: ref, left: 0, top: 10 },
          { input: cur, left: rm.width + 30, top: 10 },
        ])
        .png().toFile('_lblprobe_out/sbs_' + id + '.png');
      console.log(id, 'ok');
    } catch (e) { console.log(id, 'ERR', String(e.message).slice(0, 80)); }
  }
})();
