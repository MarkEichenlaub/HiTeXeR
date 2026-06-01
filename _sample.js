const sharp = require('sharp');
(async () => {
  for (const f of ['comparison/texer_pngs/03281.png','comparison/htx_pngs/03281.png']) {
    const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, C = info.channels;
    const px = (xf, yf) => {
      const x = Math.round(xf*W), y = Math.round(yf*H);
      const i = (y*W + x)*C;
      return [data[i], data[i+1], data[i+2]];
    };
    console.log(f, W+'x'+H);
    console.log('  side-wall (0.05,0.45):', px(0.05,0.45));
    console.log('  curtain-left (0.20,0.55):', px(0.20,0.55));
    console.log('  curtain-right(0.32,0.40):', px(0.32,0.40));
    console.log('  back-top (0.12,0.18):', px(0.12,0.18));
  }
})();
