global.window = {};
const Module = require('module');
const path = require('path');
// patch source to add logging? Instead, monkeypatch console in interp via env.
require('./asy-interp.js');
const fs = require('fs');
const A = global.window.AsyInterp;
const code = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
// Render and inspect commandMap entries that are labels with text containing 'mathrm'
const out = A.render(code, {});
const cm = out.commandMap;
let i=0;
for (const e of cm) {
  if (e && typeof e === 'object') {
    const s = JSON.stringify(e);
    if (s.includes('mathrm') || (e.cmd==='label')) {
      console.log('IDX', i, 'cmd', e.cmd, 'text', e.text, 'pos', JSON.stringify(e.pos), 'from3d', e._from3d, 'align', JSON.stringify(e.align));
    }
  }
  i++;
}
