global.window={};global.katex=require('katex');require('./asy-interp.js');
const A=global.window.AsyInterp;const fs=require('fs');
const raw=fs.readFileSync('comparison/asy_src/03281.asy','utf8');
const r=A.render('[asy]\n'+raw+'\n[/asy]',{containerW:800,containerH:600,labelOutput:'svg-native'});
const re=/<path\b[^>]*\bd="([^"]+)"[^>]*stroke="#000000"[^>]*stroke-width="([\d.]+)"/g;let m,i=0;
while((m=re.exec(r.svg))){
  const d=m[1],w=m[2];const nums=[...d.matchAll(/-?\d+\.?\d*/g)].map(x=>+x[0]);
  let xmn=1e9,xmx=-1e9,ymn=1e9,ymx=-1e9;
  for(let k=0;k<nums.length;k+=2){const x=nums[k],y=nums[k+1];if(x<xmn)xmn=x;if(x>xmx)xmx=x;if(y<ymn)ymn=y;if(y>ymx)ymx=y;}
  console.log('edge'+(i++)+' w='+w+' xs['+xmn.toFixed(0)+'..'+xmx.toFixed(0)+'] ys['+ymn.toFixed(0)+'..'+ymx.toFixed(0)+'] npts='+(nums.length/2)+' d='+d.slice(0,90));
}
console.log('total black edges:',i);
