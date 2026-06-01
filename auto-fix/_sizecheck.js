const s = require('sharp');
(async () => {
  for (const f of ['comparison/texer_pngs/06065.png', 'comparison/htx_pngs/06065.png']) {
    try {
      const t = await s(f).trim().toBuffer({ resolveWithObject: true });
      console.log(f, 'trimmed', t.info.width, t.info.height);
    } catch (e) {
      console.log(f, 'ERR', e.message);
    }
  }
})();
