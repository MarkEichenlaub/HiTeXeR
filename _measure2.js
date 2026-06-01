const sharp = require('sharp');
async function analyze(p, label){
  const {data, info} = await sharp(p).flatten({background:{r:255,g:255,b:255}}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  const dark=(x,y)=>data[y*W+x]<128;
  // x-axis = widest horizontal dark run
  let axisRow=-1,bestRun=0;
  for(let y=0;y<H;y++){let run=0,mx=0;for(let x=0;x<W;x++){if(dark(x,y)){run++;if(run>mx)mx=run;}else run=0;}if(mx>bestRun){bestRun=mx;axisRow=y;}}
  // y-axis = tallest vertical dark run (the vertical axis line)
  let axisCol=-1,bestV=0;
  for(let x=0;x<W;x++){let run=0,mx=0;for(let y=0;y<H;y++){if(dark(x,y)){run++;if(run>mx)mx=run;}else run=0;}if(mx>bestV){bestV=mx;axisCol=x;}}
  // topmost dark pixel anywhere (bars top region) to the RIGHT of axisCol+5
  let barTop=-1;
  for(let y=0;y<axisRow;y++){let c=0;for(let x=axisCol+5;x<W;x++)if(dark(x,y))c++;if(c>2){barTop=y;break;}}
  // leftmost dark pixel (y-label left edge) above axis
  let leftEdge=W;
  for(let y=0;y<axisRow-3;y++){for(let x=0;x<axisCol;x++){if(dark(x,y)){if(x<leftEdge)leftEdge=x;break;}}}
  console.log(`${label}: ${W}x${H}`);
  console.log(`  y-axis col=${axisCol} (vlen=${bestV})  x-axis row=${axisRow} (${(axisRow/H*100).toFixed(1)}%)`);
  console.log(`  bars top row=${barTop}  => plot height (barTop..axis)=${axisRow-barTop}px  topPad=${barTop}px`);
  console.log(`  plot width (axisCol..right bar): ylabel-left-edge=${leftEdge}px  plotLeft=${axisCol}px`);
  console.log(`  bottomPad (axis..bottom)=${H-axisRow}px`);
}
(async()=>{await analyze('comparison/texer_pngs/06507.png','REF');await analyze('comparison/htx_pngs/06507.png','HTX');})();
