const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
const re=/<path[^>]*\bd="([^"]+)"[^>]*>/g;let m;const paths=[];
while((m=re.exec(svg))){paths.push(m[0]);}
function nums(d){return (d.match(/-?\d+\.?\d*/g)||[]).map(Number);}
const PX=571,PY=420, tol=12;
for(const p of paths){
  const d=p.match(/\bd="([^"]+)"/)[1];const n=nums(d);
  const xs=[],ys=[];for(let k=0;k<n.length-1;k+=2){xs.push(n[k]);ys.push(n[k+1]);}
  if(!xs.length)continue;
  const yn=Math.min(...ys),yx=Math.max(...ys),xn=Math.min(...xs),xx=Math.max(...xs);
  if(xn-tol<=PX&&xx+tol>=PX&&yn-tol<=PY&&yx+tol>=PY){
    const stroke=(p.match(/stroke="([^"]*)"/)||[])[1];const fill=(p.match(/fill="([^"]*)"/)||[])[1];
    console.log('HIT bbox x['+xn.toFixed(0)+','+xx.toFixed(0)+'] y['+yn.toFixed(0)+','+yx.toFixed(0)+'] stroke='+stroke+' fill='+fill+' npts'+xs.length);
    console.log('   d=',d.slice(0,180));
  }
}
