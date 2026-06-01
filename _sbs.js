const sharp=require('sharp');
(async()=>{
  const ref=sharp('comparison/texer_pngs/03281.png');const m=await ref.metadata();
  const H=400;
  const r=await sharp('comparison/texer_pngs/03281.png').resize({height:H}).flatten({background:{r:255,g:255,b:255}}).toBuffer();
  const h=await sharp('comparison/htx_pngs/03281.png').resize({height:H}).flatten({background:{r:255,g:255,b:255}}).toBuffer();
  const rm=await sharp(r).metadata(),hm=await sharp(h).metadata();
  const W=rm.width+hm.width+20;
  await sharp({create:{width:W,height:H,channels:3,background:{r:200,g:200,b:255}}})
    .composite([{input:r,left:0,top:0},{input:h,left:rm.width+20,top:0}])
    .png().toFile('_sbs.png');
  console.log('done',W,H);
})();
