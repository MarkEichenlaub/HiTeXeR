// node refactor/ssimmap.js <id> — replicate the pipeline's raw SSIM and write the
// two compared images plus the SSIM map (dark = low) to refactor/view/<id>-ssim.png
const sharp=require('sharp'),{ssim}=require('ssim.js'),path=require('path');
const id=process.argv[2];const R=path.resolve(__dirname,'..');
const rgba=(b,w,h)=>{const o=Buffer.alloc(w*h*4);for(let i=0,j=0;i<w*h;i++){o[j++]=b[i*3];o[j++]=b[i*3+1];o[j++]=b[i*3+2];o[j++]=255}return o};
(async()=>{
 const tr=async f=>sharp(await sharp(f).flatten({background:'#fff'}).png().toBuffer()).trim({threshold:20}).toBuffer({resolveWithObject:true});
 const A=await tr(path.join(R,'comparison/texer_pngs',id+'.png')),B=await tr(path.join(R,'comparison/htx_pngs',id+'.png'));
 const maxW=Math.max(A.info.width,B.info.width),maxH=Math.max(A.info.height,B.info.height),s=Math.min(400/maxW,400/maxH,1);
 const W=Math.max(Math.round(maxW*s),11),H=Math.max(Math.round(maxH*s),11);
 const a=await sharp(A.data).resize(W,H,{fit:'fill'}).removeAlpha().raw().toBuffer(),b=await sharp(B.data).resize(W,H,{fit:'fill'}).removeAlpha().raw().toBuffer();
 const r=ssim({data:rgba(a,W,H),width:W,height:H},{data:rgba(b,W,H),width:W,height:H});
 console.log(id,'trimmed ref',A.info.width+'x'+A.info.height,'htx',B.info.width+'x'+B.info.height,'-> compared at',W+'x'+H,'raw mssim',r.mssim.toFixed(4));
 const m=r.ssim_map,mw=m.width,mh=m.height,mb=Buffer.alloc(mw*mh*3);for(let i=0;i<mw*mh;i++){const v=Math.max(0,Math.min(255,Math.round(m.data[i]*255)));mb[i*3]=mb[i*3+1]=mb[i*3+2]=v}
 const imgs=[await sharp(a,{raw:{width:W,height:H,channels:3}}).png().toBuffer(),await sharp(b,{raw:{width:W,height:H,channels:3}}).png().toBuffer(),await sharp(mb,{raw:{width:mw,height:mh,channels:3}}).resize(W,H,{fit:'fill'}).png().toBuffer()];
 await sharp({create:{width:W*3+24,height:H,channels:3,background:'#d0d0d0'}}).composite(imgs.map((im,k)=>({input:im,left:k*(W+12),top:0}))).png().toFile(path.join(__dirname,'view',id+'-ssim.png'));
})();
