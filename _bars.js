const sharp = require('sharp');
async function analyze(p, label){
  const {data, info} = await sharp(p).flatten({background:{r:255,g:255,b:255}}).raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height, ch=info.channels;
  // blue bar: detect blue-ish pixels (b high, r/g low)
  const isBlue=(x,y)=>{const i=(y*W+x)*ch;const r=data[i],g=data[i+1],b=data[i+2];return b>120&&r<120&&g<150&&b>r+40;};
  let minX=W,maxX=0,minY=H,maxY=0,cnt=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(isBlue(x,y)){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;cnt++;}
  const bw=maxX-minX, bh=maxY-minY;
  console.log(`${label}: blue bar = ${bw}w x ${bh}h px  aspect(w/h)=${(bw/bh).toFixed(4)}  px=${cnt}  (x ${minX}..${maxX}, y ${minY}..${maxY})`);
}
(async()=>{await analyze('comparison/texer_pngs/06507.png','REF');await analyze('comparison/htx_pngs/06507.png','HTX');})();
