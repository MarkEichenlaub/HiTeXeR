const sharp = require('sharp');
(async () => {
  for (const [name,p] of [['tex','comparison/texer_pngs/00572.png'],['htx','_00572.png']]) {
    const m = await sharp(p).metadata();
    await sharp(p).extract({left:Math.floor(m.width*0.45),top:0,width:Math.floor(m.width*0.55),height:m.height}).resize({height:560}).flatten({background:'#fff'}).png().toFile('_z572_'+name+'.png');
  }
  const a=await sharp('_z572_tex.png').metadata(),b=await sharp('_z572_htx.png').metadata();
  await sharp({create:{width:a.width+10+b.width,height:560,channels:4,background:'#999999ff'}}).composite([{input:'_z572_tex.png',left:0,top:0},{input:'_z572_htx.png',left:a.width+10,top:0}]).png().toFile('_z572.png');
  console.log('done (left=TEXER right=HiTeXeR)');
})();
