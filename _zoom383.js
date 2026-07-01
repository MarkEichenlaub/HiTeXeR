const sharp = require('sharp');
(async () => {
  const items = [
    ['comparison/texer_pngs/00383.png', 'tex'],
    ['C:/Users/Public/htx_oracle/o00383.png', 'orc'],
    ['_00383.png', 'htx'],
  ];
  const bufs = [], mets = [];
  for (const [p, tag] of items) {
    const m = await sharp(p).metadata();
    // bottom-left corner: left 35% width, bottom 30% height
    const w = Math.round(m.width * 0.35), h = Math.round(m.height * 0.30);
    const b = await sharp(p).flatten({ background: '#fff' })
      .extract({ left: 0, top: m.height - h, width: w, height: h })
      .resize({ width: 420, kernel: 'nearest' }).png().toBuffer();
    bufs.push(b); mets.push(await sharp(b).metadata());
  }
  let x = 0; const comps = [];
  for (let i = 0; i < bufs.length; i++) { comps.push({ input: bufs[i], left: x, top: 0 }); x += mets[i].width + 8; }
  const H = Math.max(...mets.map(m => m.height));
  await sharp({ create: { width: x, height: H, channels: 3, background: { r: 255, g: 100, b: 100 } } }).composite(comps).png().toFile('_zoom383.png');
  console.log('ok tex|orc|htx');
})();
