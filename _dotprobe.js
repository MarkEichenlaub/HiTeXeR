// Measure solid-dot diameters by scanning for small dark circular blobs.
const sharp = require('sharp');
(async () => {
  const p = process.argv[2];
  const { data, info } = await sharp(p).flatten({ background: { r: 255, g: 255, b: 255 } }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const dark = (x, y) => { const i = (y * W + x) * ch; return data[i] < 90 && data[i + 1] < 90 && data[i + 2] < 90; };
  // For each row, measure the longest horizontal dark run width; dots produce
  // a local max run ~= diameter. Histogram run widths in the bottom band (axis dots)
  // and a mid band (the (i,1) dots). Report distribution of run lengths between 4 and 30.
  function runs(yLo, yHi) {
    const hist = {};
    for (let y = yLo; y < yHi; y++) {
      let run = 0;
      for (let x = 0; x < W; x++) {
        if (dark(x, y)) run++;
        else { if (run >= 3 && run <= 40) hist[run] = (hist[run] || 0) + 1; run = 0; }
      }
    }
    return hist;
  }
  // axis dots band: near bottom (the number line). data line y from featprobe; just scan bottom 25%.
  const band = runs(Math.floor(H * 0.78), Math.floor(H * 0.92));
  const entries = Object.entries(band).map(([k, v]) => [+k, v]).sort((a, b) => b[1] - a[1]);
  console.log(p, 'W=' + W, 'H=' + H, '| bottom-band run-width histogram (width:count), top:', entries.slice(0, 8).map(e => e[0] + ':' + e[1]).join(' '));
})();
