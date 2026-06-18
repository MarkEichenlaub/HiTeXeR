const sharp = require('sharp');
(async () => {
  // crop leftmost ~28% width, full height, from both; scale to same height 600
  for (const [name, p] of [['tex','comparison/texer_pngs/04337.png'],['htx','_04337.png']]) {
    const m = await sharp(p).metadata();
    const cw = Math.floor(m.width*0.26);
    await sharp(p).extract({left:0,top:0,width:cw,height:m.height}).resize({height:600}).flatten({background:'#fff'}).png().toFile('_z4337_'+name+'.png');
  }
  const a = await sharp('_z4337_tex.png').metadata();
  const b = await sharp('_z4337_htx.png').metadata();
  const sep=8; const tot=a.width+sep+b.width;
  await sharp({create:{width:tot,height:600,channels:4,background:'#bbbbbbff'}})
    .composite([{input:'_z4337_tex.png',left:0,top:0},{input:'_z4337_htx.png',left:a.width+sep,top:0}]).png().toFile('_z4337.png');
  console.log('done', a.width, b.width);
})();
