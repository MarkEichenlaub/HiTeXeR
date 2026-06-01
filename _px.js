const sharp=require('sharp');
(async()=>{
for(const f of ['comparison/texer_pngs/03281.png','comparison/htx_pngs/03281.png']){
  const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height;
  const at=(x,y)=>{const i=(W*y+x)*info.channels;return data[i]+','+data[i+1]+','+data[i+2];};
  console.log(f,W+'x'+H);
  const pts={curvedFace:[0.30,0.45],endCapLeft:[0.06,0.45],midPanel:[0.18,0.45],topRidge:[0.22,0.18],bg:[0.5,0.05]};
  for(const k in pts){const x=Math.round(pts[k][0]*W),y=Math.round(pts[k][1]*H);console.log('  ',k,'('+x+','+y+')',at(x,y));}
}
})();
