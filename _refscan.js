const sharp=require('sharp');
(async()=>{
 for(const f of ['comparison/texer_pngs/03281.png','comparison/htx_pngs/03281.png']){
  const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height,ch=info.channels;
  const val=(x,y)=>{const i=(W*y+x)*ch;return Math.min(data[i],data[i+1],data[i+2]);};
  // find axis row in right half
  let best={cnt:-1,y:0};
  for(let y=Math.round(H*0.6);y<Math.round(H*0.85);y++){let c=0;for(let x=Math.round(W*0.6);x<Math.round(W*0.95);x++)if(val(x,y)<100)c++;if(c>best.cnt)best={cnt:c,y};}
  const y=best.y;let s='';for(let x=Math.round(W*0.58);x<Math.round(W*0.96);x++){const v=Math.min(val(x,y-1),val(x,y),val(x,y+1));s+= v<80?'#':v<160?'+':'.';}
  console.log(f,'axisY='+y);console.log(s);
 }
})();
