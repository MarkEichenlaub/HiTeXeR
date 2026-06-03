const fs=require('fs'),path=require('path');
const sharp=require('sharp');
const ids=process.argv.slice(2);
(async()=>{
 console.log('id     texer(WxH)   htx(WxH)     wRatio hRatio');
 for(const id of ids){
  const tp=path.join('comparison','texer_pngs',id+'.png');
  const hp=path.join('comparison','htx_pngs',id+'.png');
  if(!fs.existsSync(tp)){console.log(id,'no texer');continue;}
  if(!fs.existsSync(hp)){console.log(id,'no htx');continue;}
  const tm=await sharp(tp).metadata(), hm=await sharp(hp).metadata();
  const wr=(hm.width/tm.width).toFixed(3), hr=(hm.height/tm.height).toFixed(3);
  console.log(id.padEnd(6), `${tm.width}x${tm.height}`.padEnd(12), `${hm.width}x${hm.height}`.padEnd(12), wr, hr);
 }
})();
