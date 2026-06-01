const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
const re=/<(path|polygon|line)[^>]*>/g;let m;const els=[];
while((m=re.exec(svg))){els.push(m[0]);}
function pts(d){const n=(d.match(/-?\d+\.?\d*/g)||[]).map(Number);const P=[];for(let k=0;k<n.length-1;k+=2)P.push([n[k],n[k+1]]);return P;}
let idx=-1;
for(const e of els){idx++;
  const dm=e.match(/\bd="([^"]+)"/)||e.match(/points="([^"]+)"/);
  if(!dm)continue;const P=pts(dm[1]);
  // does any point fall in band y[103,111] x[160,205]?
  const hit=P.some(([x,y])=>y>=103&&y<=111&&x>=160&&x<=205);
  if(hit){
    const ys=P.map(p=>p[1]),xs=P.map(p=>p[0]);
    const stroke=(e.match(/stroke="([^"]*)"/)||[])[1];
    console.log(idx,'npts'+P.length,'x['+Math.min(...xs).toFixed(1)+','+Math.max(...xs).toFixed(1)+'] y['+Math.min(...ys).toFixed(1)+','+Math.max(...ys).toFixed(1)+'] stroke='+stroke);
    // print points within band
    console.log('  band pts:',P.filter(([x,y])=>y>=103&&y<=111&&x>=160&&x<=205).map(p=>'('+p[0].toFixed(1)+','+p[1].toFixed(2)+')').join(' '));
  }
}
