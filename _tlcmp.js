const sharp = require('sharp');
(async () => {
  const items = [
    ['comparison/texer_pngs/06216.png', 'ref16'],
    ['C:/Users/Public/htx_oracle/o06216.png', 'orc16'],
    ['comparison/texer_pngs/06494.png', 'ref94'],
    ['C:/Users/Public/htx_oracle/o06494.png', 'orc94'],
  ];
  for (const [p, tag] of items) {
    const m = await sharp(p).metadata();
    const w = Math.round(m.width * 0.30), h = Math.round(m.height * 0.45);
    await sharp(p).flatten({ background: '#fff' }).extract({ left: 0, top: 0, width: w, height: h }).resize({ width: 300 }).toFile('_tl_' + tag + '.png');
  }
  const imgs = items.map(([, t]) => '_tl_' + t + '.png');
  const bufs = [], mets = [];
  for (const i of imgs) { const b = await sharp(i).toBuffer(); bufs.push(b); mets.push(await sharp(b).metadata()); }
  const H = Math.max(...mets.map(m => m.height));
  let x = 0; const comps = [];
  for (let i = 0; i < 4; i++) { comps.push({ input: bufs[i], left: x, top: 0 }); x += mets[i].width + 8; }
  await sharp({ create: { width: x, height: H, channels: 3, background: { r: 255, g: 100, b: 100 } } }).composite(comps).png().toFile('_tl_cmp.png');
  console.log('ok');
})();
