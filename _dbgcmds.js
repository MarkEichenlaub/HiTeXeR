global.window = global.window || {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;
const fs = require('fs');
const raw = fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const code = '[asy]\n'+raw+'\n[/asy]';
const r = A.render(code,{containerW:800,containerH:600,labelOutput:'svg-native'});
// parse the SVG paths: count fills vs strokes, print fill colors histogram
const svg = r.svg;
const fills = [...svg.matchAll(/fill="(#[0-9a-fA-F]{6}|rgb[^"]*)"/g)].map(m=>m[1]);
const hist={}; for(const f of fills) hist[f]=(hist[f]||0)+1;
console.log('FILL COLOR HISTOGRAM (top):');
Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log('  '+k+' x'+v));
// bold strokes
const strokes=[...svg.matchAll(/stroke="(#[0-9a-fA-F]{6})"[^>]*stroke-width="([\d.]+)"/g)];
const sw={}; for(const m of strokes){const k=m[1]+' w='+(+m[2]).toFixed(1); sw[k]=(sw[k]||0)+1;}
console.log('STROKE histogram (top):');
Object.entries(sw).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([k,v])=>console.log('  '+k+' x'+v));
