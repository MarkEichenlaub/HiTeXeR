const sharp = require('sharp');
// Measure blue (rgb ~0,102,204) feature extents in an image.
// Separates the hash-mark ticks (a tall narrow vertical run) from the label
// (a wide run lower down) by clustering blue pixels into connected x-bands.
(async () => {
  for (const f of process.argv.slice(2)) {
    const { data, info } = await sharp(f).flatten({ background: { r: 255, g: 255, b: 255 } }).raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const pts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C, r = data[i], g = data[i + 1], b = data[i + 2];
      if (b > 140 && r < 90 && g > 50 && g < 170) pts.push([x, y]);
    }
    if (!pts.length) { console.log(f, 'no blue'); continue; }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // tick band = top 35% of the blue vertical extent (the ticks sit on the line, above the label)
    const yCut = minY + (maxY - minY) * 0.45;
    const tick = pts.filter(p => p[1] <= yCut);
    const tMinY = Math.min(...tick.map(p => p[1])), tMaxY = Math.max(...tick.map(p => p[1]));
    const tMinX = Math.min(...tick.map(p => p[0])), tMaxX = Math.max(...tick.map(p => p[0]));
    console.log(f.split(/[\\/]/).pop(), 'imgW=' + W,
      '| blue bbox', (maxX - minX) + 'x' + (maxY - minY),
      '| tick band y', tMinY + '..' + tMaxY, 'h=' + (tMaxY - tMinY), 'w=' + (tMaxX - tMinX));
  }
})();
