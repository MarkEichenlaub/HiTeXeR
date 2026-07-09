const sharp = require('sharp');
(async () => {
  const file = process.argv[2];
  const { data, info } = await sharp(file).flatten({background:'#ffffff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  // for each row, count dark px; group consecutive dark rows into bands
  const bands=[];
  let cur=null;
  for (let y=0;y<H;y++){
    let dark=0, sum=0;
    for (let x=0;x<W;x++){ const v=data[y*W+x]; if (v<128) dark++; sum += 255-v; }
    if (dark > W/3) { if (!cur) { cur={y0:y, rows:[]}; bands.push(cur);} cur.rows.push({y,dark,ink:sum/W}); }
    else cur=null;
  }
  for (const b of bands) {
    const ink = b.rows.reduce((s,r)=>s+r.ink,0);
    console.log('band@y'+b.y0, 'rows='+b.rows.length, 'totalInk='+(ink/255).toFixed(2)+'px-equiv');
  }
})();
