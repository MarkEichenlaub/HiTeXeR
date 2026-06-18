// Measure axis/data-line features in a rendered png.
const sharp = require('sharp');
(async () => {
  const p = process.argv[2];
  const { data, info } = await sharp(p).flatten({ background: { r: 255, g: 255, b: 255 } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const dark = (x, y) => { const i = (y * W + x) * ch; return data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110; };
  // column dark counts & row dark counts
  const colCnt = new Array(W).fill(0), rowCnt = new Array(H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) { colCnt[x]++; rowCnt[y]++; }
  // y-axis = tallest column (most dark px)
  let axCol = 0; for (let x = 0; x < W; x++) if (colCnt[x] > colCnt[axCol]) axCol = x;
  // x-axis = widest row
  let axRow = 0; for (let y = 0; y < H; y++) if (rowCnt[y] > rowCnt[axRow]) axRow = y;
  // y-axis vertical extent (in axCol)
  let yT = H, yB = -1; for (let y = 0; y < H; y++) if (dark(axCol, y)) { if (y < yT) yT = y; if (y > yB) yB = y; }
  // x-axis horizontal extent (in axRow)
  let xL = W, xR = -1; for (let x = 0; x < W; x++) if (dark(x, axRow)) { if (x < xL) xL = x; if (x > xR) xR = x; }
  // data line: a wide-ish row that is NOT the x-axis, in the region right of axis
  let bestRow = -1, bestC = 0;
  for (let y = 0; y < H; y++) { if (Math.abs(y - axRow) < 8) continue; let c = 0; for (let x = axCol + 3; x < W; x++) if (dark(x, y)) c++; if (c > bestC) { bestC = c; bestRow = y; } }
  console.log(p, 'W=' + W, 'H=' + H);
  console.log('  y-axis col=' + axCol + ' (' + (axCol / W).toFixed(2) + 'W) vert=[' + yT + ',' + yB + ']');
  console.log('  x-axis row=' + axRow + ' (' + (axRow / H).toFixed(2) + 'H) horiz=[' + xL + ',' + xR + ']');
  console.log('  data-line row=' + bestRow + ' fracDownFromAxisTop=' + ((bestRow - yT) / (axRow - yT)).toFixed(3) + ' (0=top,1=xaxis)');
  console.log('  x-axis left-of-origin px=' + (axCol - xL) + ' right-of-origin px=' + (xR - axCol));
})();
