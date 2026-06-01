const sharp = require('sharp');
(async()=>{
  for(const [p,l] of [['comparison/texer_pngs/06507.png','REF'],['comparison/htx_pngs/06507.png','HTX']]){
    const m = await sharp(p).metadata();
    const t = await sharp(p).flatten({background:{r:255,g:255,b:255}}).trim({threshold:20}).toBuffer({resolveWithObject:true});
    console.log(`${l}: raw ${m.width}x${m.height} (aspect ${(m.width/m.height).toFixed(3)}) | trimmed ${t.info.width}x${t.info.height} (aspect ${(t.info.width/t.info.height).toFixed(3)}) | trim offset L=${t.info.trimOffsetLeft} T=${t.info.trimOffsetTop}`);
  }
})();
