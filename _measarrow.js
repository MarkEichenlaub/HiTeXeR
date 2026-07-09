// Measure arrowhead footprint: for each horizontal band (line), find the max
// vertical dark extent (head height) and the x-span of pixels where extent > shaft.
const sharp = require('sharp');
(async () => {
  const [file, scaleArg] = process.argv.slice(2);
  const scale = parseFloat(scaleArg||'1');
  const { data, info } = await sharp(file).flatten({background:'#ffffff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  // column dark-extent profile
  const bandYs = [];
  // find rows that are part of horizontal lines: rows with many dark px
  for (let y=0;y<H;y++){ let d=0; for(let x=0;x<W;x++) if (data[y*W+x]<100) d++; if (d>W*0.3) bandYs.push(y); }
  // group
  const groups=[]; let g=null;
  for (const y of bandYs){ if (g && y-g[g.length-1]<=12){g.push(y);} else {g=[y];groups.push(g);} }
  for (const grp of groups) {
    const yc = Math.round((grp[0]+grp[grp.length-1])/2);
    // scan right 40% of width for the head: max vertical extent around yc +-30
    let maxExt=0, headArea=0;
    for (let x=Math.floor(W*0.5); x<W; x++){
      let ext=0;
      for (let y=Math.max(0,yc-30); y<Math.min(H,yc+30); y++) if (data[y*W+x]<100) ext++;
      if (ext>maxExt) maxExt=ext;
      headArea += ext;
    }
    console.log('line@y'+yc, 'headMaxExtent='+(maxExt/scale).toFixed(2)+'px', 'headArea='+(headArea/scale/scale).toFixed(0));
  }
})();
