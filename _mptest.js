global.window = {};
global.katex = require('katex');
const fs=require('fs');
// monkeypatch: read asy-interp source, but easier — just call render and add a hook via env var
process.env.HTX_MP_DBG='1';
require('./asy-interp.js');
const A = global.window.AsyInterp;
const src = fs.readFileSync('comparison/asy_src/04702.asy','utf8');
const r = A.render('[asy]\n'+src+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'});
