const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
// find all path d="..." and report ones that are near-horizontal long lines
const re=/<path[^>]*\bd="([^"]+)"[^>]*>/g;let m;let i=0;
const paths=[];
while((m=re.exec(svg))){paths.push({d:m[1],full:m[0]});}
console.log('paths',paths.length);
// parse numbers, find horizontal extent and y-range
function nums(d){return (d.match(/-?\d+\.?\d*/g)||[]).map(Number);}
for(const p of paths){
  const n=nums(p.d);
  const xs=[],ys=[];for(let k=0;k<n.length-1;k+=2){xs.push(n[k]);ys.push(n[k+1]);}
  if(xs.length<2)continue;
  const yn=Math.min(...ys),yx=Math.max(...ys),xn=Math.min(...xs),xx=Math.max(...xs);
  // near-horizontal: y range small, x range large, and y near 380-430 (axis area)
  if((yx-yn)<6 && (xx-xn)>80){
    console.log('HLINE x['+xn.toFixed(0)+','+xx.toFixed(0)+'] y['+yn.toFixed(0)+','+yx.toFixed(0)+'] npts'+xs.length, p.full.match(/stroke="[^"]*"/)||'', p.full.match(/stroke-width="[^"]*"/)||'');
    console.log('   d=',p.d.slice(0,160));
  }
}
