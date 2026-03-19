'use strict';
global.window = {};
global.katex = require('katex');
require('./asy-interp.js');
const A = window.AsyInterp;
const fs = require('fs'), path = require('path');

const testIds = ['06814','06816','05799','06841','05677','05856','05616','05632','05666'];
const srcDir = 'comparison/asy_src';
const outDir = 'comparison/htx_svgs';

for (const id of testIds) {
  const src = path.join(srcDir, id + '.asy');
  if (!fs.existsSync(src)) { console.log(id + ': no .asy source'); continue; }
  const raw = fs.readFileSync(src, 'utf8');
  const code = '[asy]\n' + raw + '\n[/asy]';
  try {
    const r = A.render(code, { containerW: 500, containerH: 400 });
    const outPath = path.join(outDir, id + '_new.svg');
    fs.writeFileSync(outPath, r.svg);
    const wm = r.svg.match(/width="([^"]+)"/);
    const hm = r.svg.match(/height="([^"]+)"/);
    console.log(id + ': ok width=' + (wm ? wm[1] : '?') + ' height=' + (hm ? hm[1] : '?'));
  } catch(e) {
    console.log(id + ': ERROR ' + e.message.substring(0,100));
  }
}
