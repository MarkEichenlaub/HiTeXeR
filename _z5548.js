const sharp = require('sharp');
(async () => {
  // Remaining column: right portion. crop right 45%.
  for (const [name, p] of [['tex','comparison/texer_pngs/05548.png'],['htx','_05548.png']]) {
    const m = await sharp(p).metadata();
    await sharp(p).extract({left:Math.floor(m.width*0.52),top:0,width:Math.floor(m.width*0.42),height:m.height}).resize({height:600}).flatten({background:'#fff'}).png().toFile('_zr_'+name+'.png');
  }
  const a=await sharp('_zr_tex.png').metadata(),b=await sharp('_zr_htx.png').metadata();
  await sharp({create:{width:a.width+10+b.width,height:600,channels:4,background:'#999999ff'}}).composite([{input:'_zr_tex.png',left:0,top:0},{input:'_zr_htx.png',left:a.width+10,top:0}]).png().toFile('_zr5548.png');
  console.log('done (left=TEXER right=HiTeXeR)');
})();
