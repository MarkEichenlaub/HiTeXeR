const sharp = require('sharp');
(async () => {
  for (const [name,p] of [['TEXER','comparison/texer_pngs/05107.png'],['HiTeXeR','_05107.png']]) {
    const { data, info } = await sharp(p).flatten({background:{r:255,g:255,b:255}}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const W=info.width,H=info.height,ch=info.channels;
    const isCyan=(r,g,b)=> r<150 && g>120 && b>120 && Math.abs(g-b)<60 && g>r+30;
    let minx=W,maxx=0,miny=H,maxy=0,cnt=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*ch;if(isCyan(data[i],data[i+1],data[i+2])){cnt++;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}}
    console.log(name,'W='+W,'H='+H,'cyan-grid x['+minx+','+maxx+'] y['+miny+','+maxy+'] cnt='+cnt, 'gridW='+(maxx-minx),'gridH='+(maxy-miny));
  }
})();
