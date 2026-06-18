const sharp = require('sharp');
(async () => {
  for (const [name, p] of [['asy','C:/Users/Public/_04337c.png'],['htx','_04337.png']]) {
    const m = await sharp(p).metadata();
    const cw = Math.floor(m.width*0.26);
    await sharp(p).extract({left:0,top:0,width:cw,height:m.height}).resize({height:600}).flatten({background:'#fff'}).png().toFile('_zz_'+name+'.png');
  }
  const a = await sharp('_zz_asy.png').metadata(); const b = await sharp('_zz_htx.png').metadata();
  const sep=8; await sharp({create:{width:a.width+sep+b.width,height:600,channels:4,background:'#bbbbbbff'}})
    .composite([{input:'_zz_asy.png',left:0,top:0},{input:'_zz_htx.png',left:a.width+sep,top:0}]).png().toFile('_zz4337.png');
  console.log('asyW',a.width,'htxW',b.width,'(left=LOCAL ASY, right=HiTeXeR)');
})();
