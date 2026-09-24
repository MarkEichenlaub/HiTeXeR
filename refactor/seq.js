// node refactor/seq.js id1 id2 ... — render in one process sequentially, report errors/hashes
const fs=require('fs'),path=require('path'),crypto=require('crypto');const ROOT=path.resolve(__dirname,'..');
global.window={};global.katex=require('katex');const cl=console.log;console.log=console.warn=console.info=()=>{};
require(path.join(ROOT,'asy-interp.js'));const htx=require(path.join(ROOT,'htx-doc-render.js'));
for(const id of process.argv.slice(2)){const src=fs.readFileSync(path.join(ROOT,'comparison/asy_src',id+'.asy'),'utf8');
let out;try{const r=htx.isDocument(src)?{svg:htx.renderDocSVG(src,window.AsyInterp,{containerW:800,containerH:600,labelOutput:'svg-native',imageCache:{}})}:window.AsyInterp.render('[asy]\n'+src+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'});out=crypto.createHash('sha1').update(r.svg).digest('hex').slice(0,10)}catch(e){out='ERR '+e.message+' @'+(e.stack||'').split('\n')[1]}
cl(id,out)}
