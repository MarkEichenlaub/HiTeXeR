const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();
  const indexPath = 'file:///' + path.join(__dirname, 'index.html').split(path.sep).join('/');
  await page.goto(indexPath);

  const src = fs.readFileSync('./comparison/asy_src/06081.asy', 'utf-8');

  const result = await page.evaluate((code) => {
    const r = window.AsyInterp.interpret(code, {debug:true});
    const arrowCommands = [];
    for (const dc of r.drawCommands) {
      if (dc.arrow) {
        arrowCommands.push({cmd: dc.cmd, style: dc.arrow.style, size: dc.arrow.size});
      }
      if (dc.cmd === 'draw' && dc.pen && dc.pen.r === 1 && dc.pen.g === 0 && dc.pen.b === 0) {
        arrowCommands.push({note:'red draw', hasArrow: !!dc.arrow, arrowStyle: dc.arrow ? dc.arrow.style : null});
      }
    }
    return {totalCommands: r.drawCommands.length, arrowCommands};
  }, src);

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
