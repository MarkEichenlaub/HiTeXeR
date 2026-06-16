const sharp=require('sharp');
(async()=>{for(const f of process.argv.slice(2)){
const {data,info}=await sharp(f).flatten({background:{r:255,g:255,b:255}}).raw().toBuffer({resolveWithObject:true});
const {width:W,height:H,channels:C}=info; const pts=[];
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*C,r=data[i],g=data[i+1],b=data[i+2];if(b>140&&r<90&&g>50&&g<170)pts.push([x,y]);}
const ys=pts.map(p=>p[1]); const minY=Math.min(...ys),maxY=Math.max(...ys);
// label = bottom 45% of blue extent
const cut=maxY-(maxY-minY)*0.45; const lab=pts.filter(p=>p[1]>=cut);
const lx=lab.map(p=>p[0]),ly=lab.map(p=>p[1]);
console.log(f.split(/[\/]/).pop(),'labelBox',(Math.max(...lx)-Math.min(...lx))+'x'+(Math.max(...ly)-Math.min(...ly)));
}})();
