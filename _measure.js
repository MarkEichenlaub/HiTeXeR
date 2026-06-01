const sharp = require('sharp');
async function analyze(p, label){
  const img = sharp(p).flatten({background:{r:255,g:255,b:255}}).greyscale();
  const {data, info} = await img.raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  let rows=[];
  for(let y=0;y<H;y++){ let s=0; for(let x=0;x<W;x++){ if(data[y*W+x]<128)s++; } rows.push(s); }
  let bestRow=-1,bestRun=0;
  for(let y=0;y<H;y++){
    let run=0,maxRun=0;
    for(let x=0;x<W;x++){ if(data[y*W+x]<128){run++; if(run>maxRun)maxRun=run;} else run=0; }
    if(maxRun>bestRun){bestRun=maxRun;bestRow=y;}
  }
  let lblTop=-1,lblBot=-1;
  for(let y=bestRow+3;y<H;y++){ if(rows[y]>2){ if(lblTop<0)lblTop=y; lblBot=y; } }
  const leftW=Math.floor(W*0.18);
  let yTop=-1,yBot=-1;
  for(let y=0;y<bestRow-3;y++){ let s=0; for(let x=0;x<leftW;x++){ if(data[y*W+x]<128)s++; } if(s>1){ if(yTop<0)yTop=y; yBot=y; } }
  console.log(`${label}: ${W}x${H}`);
  console.log(`  x-axis row: ${bestRow} (${(bestRow/H*100).toFixed(1)}%) runLen=${bestRun}`);
  console.log(`  col labels: y ${lblTop}..${lblBot} = ${(lblBot-lblTop)} px (${((lblBot-lblTop)/H*100).toFixed(1)}% of H)`);
  console.log(`  y-label:    y ${yTop}..${yBot} = ${(yBot-yTop)}px center=${((yTop+yBot)/2/H*100).toFixed(1)}%`);
}
(async()=>{ await analyze('comparison/texer_pngs/06507.png','REF'); await analyze('comparison/htx_pngs/06507.png','HTX'); })();
