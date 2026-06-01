const fs=require('fs');
const svg=fs.readFileSync('_03281.svg','utf8');
const re=/<(path|rect|polygon|image|g|use)[^>]*>/g;let m;const els=[];
while((m=re.exec(svg))){els.push({s:m[0],pos:m.index});}
function nums(d){return (d.match(/-?\d+\.?\d*/g)||[]).map(Number);}
const PTS=[[170,107],[174,107],[178,107]];
let idx=-1;
for(const e of els){idx++;const el=e.s;
  let xs=[],ys=[];
  const dm=el.match(/\bd="([^"]+)"/);
  if(dm){const n=nums(dm[1]);for(let k=0;k<n.length-1;k+=2){xs.push(n[k]);ys.push(n[k+1]);}}
  else if(el.startsWith('<rect')){const x=+(el.match(/x="([\d.\-]+)"/)||[])[1],y=+(el.match(/y="([\d.\-]+)"/)||[])[1],w=+(el.match(/width="([\d.\-]+)"/)||[])[1],h=+(el.match(/height="([\d.\-]+)"/)||[])[1];if(!isNaN(x)){xs=[x,x+w];ys=[y,y+h];}}
  else if(el.startsWith('<polygon')){const n=nums((el.match(/points="([^"]+)"/)||[])[1]||'');for(let k=0;k<n.length-1;k+=2){xs.push(n[k]);ys.push(n[k+1]);}}
  if(!xs.length)continue;
  const yn=Math.min(...ys),yx=Math.max(...ys),xn=Math.min(...xs),xx=Math.max(...xs);
  const tol=2;
  if(PTS.some(([PX,PY])=>xn-tol<=PX&&xx+tol>=PX&&yn-tol<=PY&&yx+tol>=PY)){
    const fill=(el.match(/fill="([^"]*)"/)||[])[1];const stroke=(el.match(/stroke="([^"]*)"/)||[])[1];const op=(el.match(/opacity="([^"]*)"/)||[])[1];
    console.log(idx,el.split(' ')[0].slice(1),'x['+xn.toFixed(1)+','+xx.toFixed(1)+'] y['+yn.toFixed(1)+','+yx.toFixed(1)+'] fill='+fill+' stroke='+stroke+(op?' op='+op:''));
  }
}
