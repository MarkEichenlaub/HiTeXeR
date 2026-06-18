const sharp=require('sharp');
(async()=>{
  for(const [name,p] of [['TEXER','comparison/texer_pngs/03290.png'],['HTX','_03290.png']]){
    const {data,info}=await sharp(p).flatten({background:{r:255,g:255,b:255}}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const W=info.width,H=info.height,ch=info.channels;
    // red arrowheads (x/y axes). find red pixels (R high, G/B low). measure the bounding blob widths at the arrow tips (extremes).
    let redCount=0, minx=W,maxx=0,miny=H,maxy=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*ch;const r=data[i],g=data[i+1],b=data[i+2];if(r>150&&g<90&&b<90){redCount++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}}
    // measure max horizontal red run (arrowhead width at the y-arrow tip, right side)
    let maxRun=0;
    for(let y=0;y<H;y++){let run=0,best=0;for(let x=0;x<W;x++){const i=(y*W+x)*ch;if(data[i]>150&&data[i+1]<90&&data[i+2]<90)run++;else{if(run>best)best=run;run=0;}}if(best>maxRun&&best<60)maxRun=best;}
    console.log(name,'W='+W,'red px='+redCount,'redbbox=['+minx+','+maxx+']x['+miny+','+maxy+']','maxRedHrun(arrowhead-ish)='+maxRun);
  }
})();
