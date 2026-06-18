const sharp = require('sharp');
(async () => {
  for (const [name, p] of [['tex','comparison/texer_pngs/11731.png'],['htx','_11731.png']]) {
    const m = await sharp(p).metadata();
    // purple region is upper-right; crop right 40%, top 55%
    const left = Math.floor(m.width*0.58), top = Math.floor(m.height*0.0), w = Math.floor(m.width*0.42), h = Math.floor(m.height*0.55);
    await sharp(p).extract({left,top,width:w,height:h}).resize({height:500}).flatten({background:'#fff'}).png().toFile('_zp_'+name+'.png');
  }
  const a = await sharp('_zp_tex.png').metadata(); const b = await sharp('_zp_htx.png').metadata();
  await sharp({create:{width:a.width+10+b.width,height:500,channels:4,background:'#999999ff'}})
    .composite([{input:'_zp_tex.png',left:0,top:0},{input:'_zp_htx.png',left:a.width+10,top:0}]).png().toFile('_zp11731.png');
  console.log('done (left=TEXER, right=HiTeXeR)');
})();
