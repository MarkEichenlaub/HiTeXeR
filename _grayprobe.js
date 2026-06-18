const sharp = require('sharp');
(async () => {
  const p = 'comparison/texer_pngs/11731.png';
  const { data, info } = await sharp(p).flatten({ background: { r: 255, g: 255, b: 255 } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  // gray = R≈G≈B (neutral), value between 110 and 225 (not black line, not white)
  const vals = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch; const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 14 && mn > 110 && mx < 225) vals.push((r + g + b) / 3);
  }
  vals.sort((a, b) => a - b);
  if (vals.length) console.log('neutral-gray pixels n=' + vals.length, 'median=' + vals[Math.floor(vals.length/2)].toFixed(1), 'p25=' + vals[Math.floor(vals.length*0.25)].toFixed(1), 'p75=' + vals[Math.floor(vals.length*0.75)].toFixed(1), '=> gray fraction median=' + (vals[Math.floor(vals.length/2)]/255).toFixed(3));
  else console.log('no neutral gray found');
})();
