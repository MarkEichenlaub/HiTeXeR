// Measure vertical extent of the rotated y-label vs the axis in a texer ref png.
const sharp = require('sharp');
const id = process.argv[2] || '06504';
(async () => {
  const p = 'comparison/texer_pngs/' + id + '.png';
  const { data, info } = await sharp(p).flatten({ background: { r: 255, g: 255, b: 255 } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const dark = (x, y) => { const i = (y * W + x) * ch; return data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120; };
  // axis vertical line: column with most dark pixels in x in [0.05W, 0.45W]
  let bestX = -1, bestCnt = 0;
  for (let x = Math.floor(W * 0.05); x < Math.floor(W * 0.45); x++) { let c = 0; for (let y = 0; y < H; y++) if (dark(x, y)) c++; if (c > bestCnt) { bestCnt = c; bestX = x; } }
  let axTop = H, axBot = -1;
  for (let y = 0; y < H; y++) if (dark(bestX, y)) { if (y < axTop) axTop = y; if (y > axBot) axBot = y; }
  const axH = axBot - axTop;
  // y-label band: x in [0, bestX-8], y in [axTop+5, axBot] (below title which is above axTop)
  let lblTop = H, lblBot = -1;
  for (let y = axTop + 3; y <= axBot; y++) for (let x = 0; x < bestX - 8; x++) if (dark(x, y)) { if (y < lblTop) lblTop = y; if (y > lblBot) lblBot = y; break; }
  console.log(id, 'axis y=[' + axTop + ',' + axBot + '] H=' + axH,
    '| ylabel y=[' + lblTop + ',' + lblBot + ']',
    'topFracFromAxisTop=' + ((lblTop - axTop) / axH).toFixed(3),
    'centerFracFromAxisTop=' + (((lblTop + lblBot) / 2 - axTop) / axH).toFixed(3));
})();
