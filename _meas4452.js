const sharp=require('sharp');
(async()=>{
  for(const [name,p] of [['TEXER','comparison/texer_pngs/04452.png'],['HTX','_04452.png']]){
    const {data,info}=await sharp(p).flatten({background:{r:255,g:255,b:255}}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const W=info.width,H=info.height,ch=info.channels;
    const isCyan=(r,g,b)=>r<150&&g>120&&b>120&&Math.abs(g-b)<60&&g>r+30;
    const isBlack=(r,g,b)=>r<90&&g<90&&b<90;
    // grid cyan vertical extent
    let gTop=H,gBot=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*ch;if(isCyan(data[i],data[i+1],data[i+2])){if(y<gTop)gTop=y;if(y>gBot)gBot=y;break;}}
    // legend box: black horizontal lines in the lower part (below grid). find rows with long black runs below gBot
    let legTop=0,legBot=0;
    for(let y=gBot+2;y<H;y++){let c=0;for(let x=0;x<W;x++){const i=(y*W+x)*ch;if(isBlack(data[i],data[i+1],data[i+2]))c++;}if(c>W*0.2){if(!legTop)legTop=y;legBot=y;}}
    console.log(name,'H='+H,'grid y=['+gTop+','+gBot+'] gridH='+(gBot-gTop),'legendBox y=['+legTop+','+legBot+']','gap(grid->legend)='+(legTop?legTop-gBot:'n/a'));
  }
})();
