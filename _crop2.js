const sharp=require('sharp');
(async()=>{
 const m=await sharp('comparison/htx_pngs/03281.png').metadata();
 await sharp('comparison/htx_pngs/03281.png').extract({left:Math.round(m.width*0.52),top:Math.round(m.height*0.6),width:Math.round(m.width*0.45),height:Math.round(m.height*0.35)}).resize({width:700}).toFile('_xaxis.png');
})();
