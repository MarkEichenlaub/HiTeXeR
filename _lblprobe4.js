'use strict';
// Browser-mode smoke test: render real corpus diagrams through the KaTeX
// browser path (same page setup as index.html) and report errors + dims.
const fs = require('fs');
const path = require('path');
const blink = require('./blink-raster.js');

const IDS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['02915', '05980', '05979', '12713', '00269', '05895', '08663', '11419', '12298', '01692'];

(async () => {
  const ROOT = __dirname;
  const browser = await blink.getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 2 });
  const katexDir = path.join(ROOT, 'node_modules', 'katex', 'dist');
  let css = fs.readFileSync(path.join(katexDir, 'katex.min.css'), 'utf8');
  css = css.replace(/src:url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\)[^;}]*/g, (m, name) => {
    const p = path.join(katexDir, 'fonts', name + '.woff2');
    if (!fs.existsSync(p)) return m;
    return `src:url("data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}") format("woff2")`;
  });
  const katexJs = fs.readFileSync(path.join(katexDir, 'katex.min.js'), 'utf8');
  const interpJs = fs.readFileSync(path.join(ROOT, 'asy-interp.js'), 'utf8');
  await page.setContent('<!DOCTYPE html><html><head><style>' + css +
    '#stage{display:inline-block;background:#fff}</style></head><body><div id="stage"></div></body></html>',
    { waitUntil: 'load' });
  await page.addScriptTag({ content: katexJs });
  await page.addScriptTag({ content: interpJs });
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('12px KaTeX_Main'), document.fonts.load('bold 12px KaTeX_Main'),
      document.fonts.load('italic 12px KaTeX_Main'), document.fonts.load('italic 12px KaTeX_Math'),
    ]);
    await document.fonts.ready;
  });
  page.on('pageerror', (e) => console.error('PAGEERROR:', String(e).slice(0, 200)));

  for (const id of IDS) {
    let code;
    try { code = fs.readFileSync(path.join(ROOT, 'comparison', 'asy_src', id + '.asy'), 'utf8'); }
    catch (e) { console.log(id, 'NO-SRC'); continue; }
    const res = await page.evaluate((c) => {
      try {
        const r = window.AsyInterp.render('[asy]\n' + c + '\n[/asy]', { containerW: 800, containerH: 600, imageCache: {} });
        if (!r || !r.svg) return 'no-svg';
        document.getElementById('stage').innerHTML = r.svg;
        const labels = (r.svg.match(/<text|<foreignObject/g) || []).length;
        const m = r.svg.match(/viewBox="([^"]+)"/);
        return 'ok vb=' + (m ? m[1] : '?') + ' labelEls=' + labels;
      } catch (e) { return 'ERR: ' + (e && e.message ? e.message.slice(0, 160) : String(e)); }
    }, code);
    console.log(id, res);
    if (String(res).startsWith('ok')) {
      const el = await page.$('#stage svg');
      if (el) fs.writeFileSync(path.join(ROOT, '_lblprobe_out', id + '_browser.png'), await el.screenshot({ type: 'png' }));
    }
  }
  await blink.closeBrowser();
})().catch(e => { console.error(e); process.exit(1); });
