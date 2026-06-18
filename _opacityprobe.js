// Measure fill opacity from 11731 texer ref: sample purple-over-white vs purple-over-black-arc.
const sharp = require('sharp');
(async () => {
  const p = 'comparison/texer_pngs/11731.png';
  const { data, info } = await sharp(p).flatten({ background: { r: 255, g: 255, b: 255 } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  // Find purple pixels: R high, G lower, B high, not white, not gray (R≈B>G)
  const isPurple = (r, g, b) => r > 180 && b > 180 && g < r - 15 && g < b - 5 && r < 250;
  // collect purple pixels, find their bounding region
  let minx = W, maxx = 0, miny = H, maxy = 0, cnt = 0;
  const sumW = [0, 0, 0]; let nW = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    if (isPurple(r, g, b)) { cnt++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; sumW[0] += r; sumW[1] += g; sumW[2] += b; nW++; }
  }
  console.log('purple region x[' + minx + ',' + maxx + '] y[' + miny + ',' + maxy + '] count=' + cnt);
  console.log('avg purple-over-white =', sumW.map(s => (s / nW).toFixed(1)));
  // darker purple (purple over a black line): purple-ish but markedly darker
  const isDarkPurple = (r, g, b) => r > 90 && r < 185 && b > 90 && b < 200 && g < r && Math.abs(r - b) < 60;
  const sumB = [0, 0, 0]; let nB = 0;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const [r, g, b] = px(x, y);
    if (isDarkPurple(r, g, b)) { sumB[0] += r; sumB[1] += g; sumB[2] += b; nB++; }
  }
  if (nB > 5) {
    const cb = sumB.map(s => s / nB);
    const cw = sumW.map(s => s / nW);
    console.log('avg purple-over-darkline =', cb.map(v => v.toFixed(1)), 'n=' + nB);
    // a = 1 - (Cw - Cb)/255  per channel
    const a = [0, 1, 2].map(i => 1 - (cw[i] - cb[i]) / 255);
    console.log('implied opacity a per channel =', a.map(v => v.toFixed(3)), 'avg=', (a.reduce((s, v) => s + v) / 3).toFixed(3));
    // base color B = Cb / a
    const B = [0, 1, 2].map(i => cb[i] / a[i]);
    console.log('implied base color B =', B.map(v => v.toFixed(1)));
  } else console.log('not enough dark-purple pixels found (n=' + nB + ')');
})();
