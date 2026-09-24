// node --cpu-prof refactor/prof.js <id> — render one corpus id (for profiling)
const fs=require('fs'),path=require('path');const ROOT=path.resolve(__dirname,'..');
global.window={};global.katex=require('katex');const cl=console.log;console.log=console.warn=()=>{};
require(path.join(ROOT,'asy-interp.js'));const htx=require(path.join(ROOT,'htx-doc-render.js'));
const id=process.argv[2];const src=fs.readFileSync(path.join(ROOT,'comparison/asy_src',id+'.asy'),'utf8');
const N=+(process.argv[3]||1);let t=Date.now(),r;
for(let i=0;i<N;i++) r=htx.isDocument(src)?{svg:htx.renderDocSVG(src,window.AsyInterp,{containerW:800,containerH:600,labelOutput:'svg-native',imageCache:{}})}:window.AsyInterp.render('[asy]\n'+src+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'});
cl(id,((Date.now()-t)/N).toFixed(0)+'ms',r.svg.length,r.error||'');
