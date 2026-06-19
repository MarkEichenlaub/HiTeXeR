const sharp=require('sharp');
(async()=>{
  for(const [name,p] of [['TEXER','comparison/texer_pngs/08812.png'],['HTX','_08812.png']]){
    const {data,info}=await sharp(p).flatten({background:{r:255,g:255,b:255}}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const W=info.width,H=info.height,ch=info.channels;
    const dark=(x,y)=>{const i=(y*W+x)*ch;return data[i]<140&&data[i+1]<140&&data[i+2]<140;};
    // y-title: leftmost ~7% band, vertical extent of dark
    const band=Math.floor(W*0.07);
    let tT=H,tB=0;for(let y=0;y<H;y++)for(let x=0;x<band;x++)if(dark(x,y)){if(y<tT)tT=y;if(y>tB)tB=y;break;}
    // plot grid: the gray plot area — find topmost & bottommost dark in the middle band (x 30%-70%)
    let gT=H,gB=0;for(let y=0;y<H;y++){let c=0;for(let x=Math.floor(W*0.3);x<Math.floor(W*0.7);x++)if(dark(x,y))c++;if(c>3){if(y<gT)gT=y;if(y>gB)gB=y;}}
    console.log(name,'H='+H,'y-title y=['+tT+','+tB+'] h='+(tB-tT),'plot(mid) y=['+gT+','+gB+'] h='+(gB-gT),'titleTopVsPlotTop='+(tT-gT));
  }
})();
