const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
const re=/<(path|rect|polygon)[^>]*>/g;let m;const els=[];
while((m=re.exec(svg))){els.push(m[0]);}
function nums(d){return (d.match(/-?\d+\.?\d*/g)||[]).map(Number);}
// target SVG coords
const PX=174.5,PY=107.0,tol=3;
let idx=-1;
for(const e of els){idx++;
  let xs=[],ys=[];
  const dm=e.match(/\bd="([^"]+)"/);
  if(dm){const n=nums(dm[1]);for(let k=0;k<n.length-1;k+=2){xs.push(n[k]);ys.push(n[k+1]);}}
  else if(e.startsWith('<rect')){const x=+(e.match(/x="([\d.\-]+)"/)||[])[1],y=+(e.match(/y="([\d.\-]+)"/)||[])[1],w=+(e.match(/width="([\d.\-]+)"/)||[])[1],h=+(e.match(/height="([\d.\-]+)"/)||[])[1];xs=[x,x+w];ys=[y,y+h];}
  else if(e.startsWith('<polygon')){const n=nums((e.match(/points="([^"]+)"/)||[])[1]||'');for(let k=0;k<n.length-1;k+=2){xs.push(n[k]);ys.push(n[k+1]);}}
  if(!xs.length)continue;
  const yn=Math.min(...ys),yx=Math.max(...ys),xn=Math.min(...xs),xx=Math.max(...xs);
  if(xn-tol<=PX&&xx+tol>=PX&&yn-tol<=PY&&yx+tol>=PY){
    const fill=(e.match(/fill="([^"]*)"/)||[])[1];const stroke=(e.match(/stroke="([^"]*)"/)||[])[1];
    console.log(idx,'bbox x['+xn.toFixed(1)+','+xx.toFixed(1)+'] y['+yn.toFixed(1)+','+yx.toFixed(1)+'] fill='+fill+' stroke='+stroke);
    console.log('   ',e.slice(0,170));
  }
}
