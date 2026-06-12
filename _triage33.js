'use strict';
// Render the 33 reported-issue IDs with CURRENT code via blink into
// _lblprobe_out/<id>_cur.png for visual triage against comparison/texer_pngs.
const fs = require('fs');
const blink = require('./blink-raster.js');
global.window = global.window || {};
require('./asy-interp.js');
const A = global.window.AsyInterp;

const IDS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '00418','05072','04086','03551','08899','03491','05975','05918','00140','00115',
  '06401','04091','02036','05572','05886','05438','04090','07645','00173','00082',
  '04965','00444','00247','05967','05132','09226','02915','08865','12386','00291',
  '08518','12383','10438',
];

(async () => {
  for (const id of IDS) {
    let code;
    try { code = fs.readFileSync('comparison/asy_src/' + id + '.asy', 'utf8'); }
    catch (e) { console.log(id, 'NO-SRC'); continue; }
    try {
      const r = A.render('[asy]\n' + code + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native', imageCache: {} });
      const png = await blink.rasterizeSVG(r.svg, { scale: 2 });
      fs.writeFileSync('_lblprobe_out/' + id + '_cur.png', png);
      console.log(id, 'ok');
    } catch (e) { console.log(id, 'ERR', String(e.message).slice(0, 100)); }
  }
  await blink.closeBrowser();
})().catch(e => { console.error(e); process.exit(1); });
