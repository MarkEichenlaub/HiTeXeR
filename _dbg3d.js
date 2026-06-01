global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const code = '[asy]\n'+raw+'\n[/asy]';
// monkeypatch: render and inspect via a hook is hard; instead set DBG env
process.env.HTX_DBG_BBOX='1';
const r = A.render(code,{containerW:800,containerH:600,labelOutput:'svg-native'});
const m = r.svg.match(/data-intrinsic-w="([^"]+)" data-intrinsic-h="([^"]+)"/);
console.log('intrinsic', m && m[1], m && m[2]);
