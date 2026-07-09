// Measure horizontal-line bands in left half: total ink AND dark-core rows (<100)
const sharp = require('sharp');
(async () => {
  const file = process.argv[2];
  const scale = parseFloat(process.argv[3]||'1'); // px per bp divisor to normalize to 3.333px/bp
  const { data, info } = await sharp(file).flatten({background:'#ffffff'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const W=info.width, H=info.height;
  const X0 = Math.floor(W*0.02), X1 = Math.floor(W*0.35); // sample inside horizontal lines
  const bands=[]; let cur=null;
  for (let y=0;y<H;y++){
    let ink=0, dark=0;
    for (let x=X0;x<X1;x++){ const v=data[y*W+x]; ink += 255-v; if (v<100) dark++; }
    const n=X1-X0;
    if (ink/n > 8) { if(!cur){cur={y0:y,ink:0,darkRows:0}; bands.push(cur);} cur.ink+=ink/n/255; if (dark>n*0.6) cur.darkRows++; }
    else cur=null;
  }
  console.log('bands:', bands.length);
  bands.forEach((b,i)=>console.log('lw'+((i+1)*0.1).toFixed(1), 'ink='+(b.ink/scale).toFixed(2), 'darkRows='+(b.darkRows/scale).toFixed(2)));
})();
