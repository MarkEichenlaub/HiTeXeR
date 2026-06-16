const sharp = require('sharp');
// Measure black-text height in a normalized x-band (fraction of image width),
// y-band (fraction of height). Reports the black-pixel vertical extent there.
(async () => {
  const [f, x0f, x1f, y0f, y1f] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5], +process.argv[6]];
  const { data, info } = await sharp(f).flatten({ background: { r: 255, g: 255, b: 255 } }).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const x0 = Math.round(x0f * W), x1 = Math.round(x1f * W), y0 = Math.round(y0f * H), y1 = Math.round(y1f * H);
  let minY = 1e9, maxY = -1, minX = 1e9, maxX = -1, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
    if (r < 90 && g < 90 && b < 90) { if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; n++; }
  }
  console.log(f.split(/[\\/]/).pop(), 'imgW=' + W, 'band x[' + x0 + ',' + x1 + '] y[' + y0 + ',' + y1 + ']',
    '-> blackBox', (maxX - minX) + 'x' + (maxY - minY), 'px,', n, 'px');
})();
