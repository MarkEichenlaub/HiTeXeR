const sharp=require('sharp');
(async()=>{
 for(const [f,o] of [['comparison/texer_pngs/03281.png','_reftop.png'],['comparison/htx_pngs/03281.png','_htxtop.png']]){
  const m=await sharp(f).metadata();
  await sharp(f).extract({left:0,top:0,width:Math.round(m.width*0.5),height:Math.round(m.height*0.35)}).resize({width:600}).toFile(o);
 }
})();
