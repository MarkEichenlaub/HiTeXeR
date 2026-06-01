const sharp=require('sharp');
(async()=>{
 await sharp('comparison/htx_pngs/03281.png').extract({left:540,top:345,width:120,height:30}).resize({width:720,kernel:'nearest'}).toFile('_dashzoom.png');
})();
