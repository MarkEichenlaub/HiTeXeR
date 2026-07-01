// side-by-side: texer ref | base(v9.47) render | new render, height-normalized
// usage: node _tri_cmp.js <id> [outH]
const sharp = require('sharp');
const id = process.argv[2];
const H = parseInt(process.argv[3] || '420', 10);
(async () => {
  const srcs = [
    ['comparison/texer_pngs/' + id + '.png', 'tex'],
    ['_base_' + id + '.png', 'base'],
    ['_' + id + '.png', 'new'],
  ];
  const bufs = [], mets = [];
  for (const [p] of srcs) {
    const b = await sharp(p).flatten({ background: '#fff' }).resize({ height: H }).png().toBuffer();
    bufs.push(b); mets.push(await sharp(b).metadata());
  }
  let x = 0; const comps = [];
  for (let i = 0; i < bufs.length; i++) { comps.push({ input: bufs[i], left: x, top: 0 }); x += mets[i].width + 6; }
  await sharp({ create: { width: x, height: H, channels: 3, background: { r: 255, g: 90, b: 90 } } })
    .composite(comps).png().toFile('_tri_' + id + '.png');
  console.log('_tri_' + id + '.png  (tex|base|new)');
})().catch(e => { console.error(e.message); process.exit(1); });
