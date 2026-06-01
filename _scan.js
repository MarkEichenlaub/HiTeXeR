const sharp=require('sharp');
(async()=>{
 const {data,info}=await sharp('comparison/htx_pngs/03281.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,ch=info.channels;
 const dark=(x,y)=>{const i=(W*y+x)*ch;return data[i]<100&&data[i+1]<100&&data[i+2]<100;};
 // x-axis is in right half, roughly y 0.6-0.85. Find the row with a long horizontal dark run in right half.
 let best=null;
 for(let y=Math.round(H*0.55);y<Math.round(H*0.9);y++){
   let run=0,x=Math.round(W*0.55);let cnt=0;
   for(x=Math.round(W*0.55);x<W;x++) if(dark(x,y)) cnt++;
   if(!best||cnt>best.cnt)best={y,cnt};
 }
 const y=best.y;console.log('axis row y=',y,'darkcount',best.cnt);
 // print dark/light pattern across right half
 let s='';for(let x=Math.round(W*0.55);x<W;x++) s+= dark(x,y)?'#':(dark(x,y-1)||dark(x,y+1)?'+':'.');
 console.log(s);
 // report gaps
 let gaps=[];let inGap=false,gs=0;const x0=Math.round(W*0.55);
 for(let x=x0;x<Math.round(W*0.98);x++){const d=dark(x,y)||dark(x,y-1)||dark(x,y+1);if(!d&&!inGap){inGap=true;gs=x;}else if(d&&inGap){inGap=false;if(x-gs>3)gaps.push([gs,x]);}}
 console.log('gaps(x):',JSON.stringify(gaps));
})();
