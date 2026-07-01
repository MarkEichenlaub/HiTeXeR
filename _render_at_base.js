// Render one corpus id with the v9.47 BASE interpreter (worktree checkout)
// but this repo's node_modules + corpus, writing _base_<id>.png. Used to
// verify whether an apparent A/B regression is real or a stale baseline.
// usage: node _render_at_base.js <id>
const fs = require('fs');
const path = require('path');
const id = process.argv[2];
if (!id) { console.error('usage: node _render_at_base.js <id>'); process.exit(1); }
global.window = {};
global.katex = require('katex');
require(path.resolve('..', 'hitexer-base-v947', 'asy-interp.js'));
const src = fs.readFileSync(path.join('comparison', 'asy_src', id + '.asy'), 'utf8');
const r = global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', {
  containerW: 800, containerH: 600, labelOutput: 'svg-native'
});
const sharp = require('sharp');
const blink = require('./blink-raster.js');
(async () => {
  const png = await blink.rasterizeSVG(r.svg, {});
  await sharp(png).png().toFile('_base_' + id + '.png');
  const m = await sharp('_base_' + id + '.png').metadata();
  console.log('wrote _base_' + id + '.png', m.width + 'x' + m.height);
  await blink.closeBrowser();
})().catch(e => { console.error(e.stack); process.exit(1); });
