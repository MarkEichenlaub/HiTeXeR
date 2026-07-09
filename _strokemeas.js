// Measure dominant stroke core widths: histogram of vertical dark-run lengths.
const sharp = require('sharp');
async function runLens(file, thr) {
  const { data, info } = await sharp(file).flatten({background:'#ffffff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  const hist = {};
  for (let x=0;x<W;x++){
    let run=0;
    for (let y=0;y<H;y++){
      const dark = data[y*W+x] < thr;
      if (dark) run++;
      else { if (run>0 && run<40) hist[run]=(hist[run]||0)+1; run=0; }
    }
    if (run>0&&run<40) hist[run]=(hist[run]||0)+1;
  }
  return hist;
}
(async () => {
  const ids = process.argv.slice(2);
  for (const id of ids) {
    for (const [tag,f] of [['TEX','comparison/texer_pngs/'+id+'.png'],['HTX','_'+id+'.png']]) {
      try {
        const h = await runLens(f, 100);
        const top = Object.entries(h).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const total = Object.values(h).reduce((a,b)=>a+b,0);
        // weighted modal width among runs 1..8 (strokes, not fills)
        console.log(id, tag, 'top runs:', top.map(([k,n])=>k+'px×'+n).join(' '), '| total runs', total);
      } catch(e){ console.log(id, tag, 'ERR', e.message); }
    }
  }
})();
