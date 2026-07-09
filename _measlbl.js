// Find the 9 anchor dots (small dark blobs) and per-dot the nearest big ink blob (the M glyph).
// Report glyph bbox offset relative to dot center, in px.
const sharp = require('sharp');
(async () => {
  const file = process.argv[2];
  const { data, info } = await sharp(file).flatten({background:'#ffffff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  const dark = (x,y)=>data[y*W+x]<128;
  // connected components (4-neigh, iterative)
  const seen = new Uint8Array(W*H);
  const comps=[];
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    if (!dark(x,y)||seen[y*W+x]) continue;
    const stack=[[x,y]]; seen[y*W+x]=1;
    let minx=x,maxx=x,miny=y,maxy=y,n=0,sx=0,sy=0;
    while(stack.length){
      const [cx,cy]=stack.pop(); n++; sx+=cx; sy+=cy;
      if(cx<minx)minx=cx; if(cx>maxx)maxx=cx; if(cy<miny)miny=cy; if(cy>maxy)maxy=cy;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=cx+dx, ny=cy+dy;
        if (nx>=0&&ny>=0&&nx<W&&ny<H&&dark(nx,ny)&&!seen[ny*W+nx]){seen[ny*W+nx]=1;stack.push([nx,ny]);}
      }
    }
    comps.push({minx,maxx,miny,maxy,n,cx:sx/n,cy:sy/n,w:maxx-minx+1,h:maxy-miny+1});
  }
  // dots: small round comps (w,h < 12); glyphs: bigger
  const dots = comps.filter(c=>c.w<=12&&c.h<=12&&c.n>=4).sort((a,b)=>(a.cy-b.cy)||(a.cx-b.cx));
  const glyphs = comps.filter(c=>c.w>12||c.h>12);
  console.log(file, 'dots:', dots.length, 'glyphs:', glyphs.length);
  for (const d of dots) {
    // nearest glyph by center distance
    let best=null, bd=1e9;
    for (const g of glyphs){ const dx=g.cx-d.cx, dy=g.cy-d.cy, dist=dx*dx+dy*dy; if(dist<bd){bd=dist;best=g;} }
    if (!best) continue;
    console.log('dot@('+d.cx.toFixed(0)+','+d.cy.toFixed(0)+') glyph bbox x['+(best.minx-d.cx).toFixed(1)+','+(best.maxx-d.cx).toFixed(1)+'] y['+(best.miny-d.cy).toFixed(1)+','+(best.maxy-d.cy).toFixed(1)+'] w'+best.w+' h'+best.h);
  }
})();
