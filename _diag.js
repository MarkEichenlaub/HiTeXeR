global.window=global.window||{};global.katex=require('katex');require('./asy-interp.js');
const A=window.AsyInterp,fs=require('fs');
for(const id of process.argv.slice(2)){
 const raw=fs.readFileSync('comparison/asy_src/'+id+'.asy','utf8');
 const r=A.render('[asy]\n'+raw+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'});
 const vb=r.svg.match(/viewBox="([^"]+)"/);
 const iw=r.svg.match(/data-intrinsic-w="([^"]+)"/), ih=r.svg.match(/data-intrinsic-h="([^"]+)"/);
 console.log(id,'viewBox=',vb?vb[1]:'?','intrinsic=',iw?iw[1]:'?','x',ih?ih[1]:'?');
}
