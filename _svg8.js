const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
const re=/<(path|polygon|line)\b[^>]*>/g;let m;const els=[];
while((m=re.exec(svg))){els.push(m[0]);}
function pts(d){const n=(d.match(/-?\d+\.?\d*/g)||[]).map(Number);const P=[];for(let k=0;k<n.length-1;k+=2)P.push([n[k],n[k+1]]);return P;}
let idx=-1;
for(const e of els){idx++;
  const dm=e.match(/\bd="([^"]+)"/)||e.match(/points="([^"]+)"/);
  if(!dm)continue;const P=pts(dm[1]);
  for(let k=0;k<P.length-1;k++){
    const [x1,y1]=P[k],[x2,y2]=P[k+1];
    // does segment cross y in [105,109] within x[165,200]?
    const ylo=Math.min(y1,y2),yhi=Math.max(y1,y2);
    if(yhi<105||ylo>109)continue;
    // x at y=107
    if(Math.abs(y2-y1)<1e-6){ if(Math.abs(y1-107)<2 && Math.max(x1,x2)>=165 && Math.min(x1,x2)<=200){console.log(idx,'HORIZ seg y='+y1.toFixed(2),'x['+x1.toFixed(1)+','+x2.toFixed(1)+']',(e.match(/stroke="([^"]*)"/)||[])[1],(e.match(/stroke-width="([^"]*)"/)||[])[1]);} continue;}
    const t=(107-y1)/(y2-y1);const xc=x1+t*(x2-x1);
    if(xc>=165&&xc<=200){console.log(idx,'CROSS y=107 at x='+xc.toFixed(1),'seg('+x1.toFixed(1)+','+y1.toFixed(1)+')-('+x2.toFixed(1)+','+y2.toFixed(1)+')',(e.match(/stroke="([^"]*)"/)||[])[1]);}
  }
}
