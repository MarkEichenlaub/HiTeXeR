const sharp=require('sharp');
(async()=>{
 for(const [f,o] of [['comparison/texer_pngs/03281.png','_ref3d.png'],['comparison/htx_pngs/03281.png','_htx3d.png']]){
  const m=await sharp(f).metadata();
  const w=Math.round(m.width*0.5);
  await sharp(f).extract({left:0,top:0,width:w,height:m.height}).resize({width:600}).toFile(o);
  console.log(o,m.width+'x'+m.height);
 }
})();
