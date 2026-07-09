const fs = require('fs');
global.window = {};
global.katex = require('katex');
require('./asy-interp.js');
const src = fs.readFileSync('C:/Users/Public/htx_probe/probe_lw.asy','utf8');
const r = global.window.AsyInterp.render('[asy]\n'+src+'\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
fs.writeFileSync('_probe_lw_htx.svg', r.svg);
const blink = require('./blink-raster.js');
const sharp = require('sharp');
(async () => {
  const png = await blink.rasterizeSVG(r.svg, {});
  await sharp(png).flatten({background:'#ffffff'}).png().toFile('_probe_lw_htx.png');
  const m = await sharp('_probe_lw_htx.png').metadata();
  console.log('HTX probe png:', m.width+'x'+m.height);
  await blink.closeBrowser();
})();
