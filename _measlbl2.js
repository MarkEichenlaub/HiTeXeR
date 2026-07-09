// Robust: blur, then around each of 9 grid anchors, ink bbox excluding dot disc.
const sharp = require('sharp');
(async () => {
  const [file, ax0s, ay0s] = process.argv.slice(2);
  const ax0=parseFloat(ax0s), ay0=parseFloat(ay0s); // first anchor
  const STEP = 400; // 120pt * 3.333
  const { data, info } = await sharp(file).flatten({background:'#ffffff'}).greyscale().blur(1.2).raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  const names=['N','S','E','W','NE','NW','SE','SW','center'];
  for (let i=0;i<9;i++){
    const gx = ax0 + (i%3)*STEP, gy = ay0 + Math.floor(i/3)*300; // 90pt*3.333
    let minx=1e9,maxx=-1,miny=1e9,maxy=-1, ink=0;
    for (let y=Math.max(0,gy-60); y<Math.min(H,gy+60); y++)
      for (let x=Math.max(0,gx-60); x<Math.min(W,gx+60); x++){
        const v = data[y*W+x];
        if (v<170){
          const dx=x-gx, dy=y-gy;
          if (dx*dx+dy*dy < 64) continue; // exclude dot disc r=8
          if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; ink++;
        }
      }
    if (maxx<0) { console.log(names[i], 'NO INK'); continue; }
    console.log(names[i], 'x['+(minx-gx).toFixed(0)+','+(maxx-gx).toFixed(0)+'] y['+(miny-gy).toFixed(0)+','+(maxy-gy).toFixed(0)+'] cx='+((minx+maxx)/2-gx).toFixed(1)+' cy='+((miny+maxy)/2-gy).toFixed(1)+' ink='+ink);
  }
})();
