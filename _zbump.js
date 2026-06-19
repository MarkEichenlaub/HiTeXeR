const sharp=require('sharp');
(async()=>{
  for(const [name,p] of [['tex','comparison/texer_pngs/03290.png'],['htx','_03290.png']]){
    const m=await sharp(p).metadata();
    // top half (the bump), full width
    await sharp(p).extract({left:0,top:0,width:m.width,height:Math.floor(m.height*0.45)}).resize({width:700}).flatten({background:'#fff'}).png().toFile('_zb_'+name+'.png');
  }
  const a=await sharp('_zb_tex.png').metadata(),b=await sharp('_zb_htx.png').metadata();
  await sharp({create:{width:Math.max(a.width,b.width),height:a.height+8+b.height,channels:4,background:'#999999ff'}})
    .composite([{input:'_zb_tex.png',left:0,top:0},{input:'_zb_htx.png',left:0,top:a.height+8}]).png().toFile('_zb290.png');
  console.log('done (top=TEXER, bottom=HiTeXeR)');
})();
