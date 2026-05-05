'use strict';
const fs = require('fs');
const path = require('path');
const inFile = process.argv[2];
if (!inFile) { console.error('usage: node _render_file.js <asy file>'); process.exit(1); }
global.window = {};
global.katex = require('katex');
require(path.resolve('asy-interp.js'));
const src = fs.readFileSync(inFile, 'utf8');
const r = global.window.AsyInterp.render('[asy]\n'+src+'\n[/asy]', {
  containerW: 800, containerH: 600
});
const out = inFile.replace(/\.asy$/, '');
fs.writeFileSync(out + '.svg', r.svg);
const sharp = require('sharp');
const wm = r.svg.match(/data-intrinsic-w="([^"]+)"/);
const hm = r.svg.match(/data-intrinsic-h="([^"]+)"/);
const W = wm ? Math.round(parseFloat(wm[1])) : 800;
const H = hm ? Math.round(parseFloat(hm[1])) : 600;
sharp(Buffer.from(r.svg), { density: 144 })
  .resize(W*2, H*2, { fit: 'inside' }).png().toFile(out + '.png')
  .then(() => console.log('wrote ' + out + '.png  ' + W + 'x' + H));
