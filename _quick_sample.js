// Quick SSIM test on a sample of diagrams affected by boost changes.
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ssim = require('ssim.js');

global.window = {};
global.katex = require('katex');
require('./asy-interp.js');
const A = global.window.AsyInterp;

// Mix: 4 target-improved (should stay good), c10_L10 regressions (need fix),
// c402 labels (known hard), c190_L11 (content regression, unrelated)
const IDS = [
  '10427','10394','10431','10432',           // boost-helped targets
  '00015','00019','00020','00021','00022',   // c10_L10 regressions
  '00023','00024','00025','00026',
  '05322','05323','05325','05319','05320',   // unitsize(1.5cm) regressions
  '05896','05904',                            // 05xxx unitsize(1)
  '03356','08567',                            // content regression (not boost)
  '04086','04087','04089','04090',           // c268_L5 regressions
  '03418','03428','03429',                    // c190_L2 regressions
];

function buildFontFaceCSS() {
  const DIR = path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');
  const faces = [
    ['KaTeX_Main','normal','normal','KaTeX_Main-Regular.woff2'],
    ['KaTeX_Main','italic','normal','KaTeX_Main-Italic.woff2'],
    ['KaTeX_Main','normal','bold','KaTeX_Main-Bold.woff2'],
    ['KaTeX_Main','italic','bold','KaTeX_Main-BoldItalic.woff2'],
    ['KaTeX_Math','normal','normal','KaTeX_Math-Italic.woff2'],
    ['KaTeX_Math','italic','normal','KaTeX_Math-Italic.woff2'],
    ['KaTeX_Math','normal','bold','KaTeX_Math-BoldItalic.woff2'],
    ['KaTeX_Math','italic','bold','KaTeX_Math-BoldItalic.woff2'],
  ];
  let css = '';
  for (const [f,s,w,file] of faces) {
    const p = path.join(DIR, file);
    if (!fs.existsSync(p)) continue;
    const b64 = fs.readFileSync(p).toString('base64');
    css += `@font-face{font-family:'${f}';font-style:${s};font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }
  return css;
}
const FONT_CSS = buildFontFaceCSS();

function embedFonts(svg) {
  return svg.replace('<style>', `<style>${FONT_CSS}`);
}

async function renderAndSsim(id) {
  const asy = fs.readFileSync(path.join(__dirname, 'comparison/asy_src', id + '.asy'), 'utf8');
  const code = '[asy]\n' + asy + '\n[/asy]';
  let svg;
  try {
    const r = A.render(code, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
    svg = embedFonts(r.svg);
  } catch (e) { return { id, err: e.message }; }

  const refPath = path.join(__dirname, 'comparison/texer_pngs', id + '.png');
  if (!fs.existsSync(refPath)) return { id, err: 'no ref' };

  // Rasterize at 144 DPI
  const htxBuf = await sharp(Buffer.from(svg), { density: 144 })
    .flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
  const htxMeta = await sharp(htxBuf).metadata();
  const refMeta = await sharp(refPath).metadata();

  // Resize to min dims, then SSIM
  const minW = Math.min(htxMeta.width, refMeta.width);
  const minH = Math.min(htxMeta.height, refMeta.height);
  const htxR = await sharp(htxBuf).resize(minW, minH).raw().ensureAlpha().toBuffer();
  const refR = await sharp(refPath).resize(minW, minH).raw().ensureAlpha().toBuffer();
  const { mssim } = ssim.ssim(
    { data: new Uint8ClampedArray(htxR), width: minW, height: minH },
    { data: new Uint8ClampedArray(refR), width: minW, height: minH }
  );

  const sigmaSize = 0.15;
  const wRatio = Math.min(htxMeta.width / refMeta.width, refMeta.width / htxMeta.width);
  const hRatio = Math.min(htxMeta.height / refMeta.height, refMeta.height / htxMeta.height);
  const logRatio = Math.sqrt(Math.pow(Math.log(wRatio),2) + Math.pow(Math.log(hRatio),2));
  const sizeScore = Math.exp(-0.5 * Math.pow(logRatio / sigmaSize, 2));
  const combined = mssim * sizeScore;

  return { id, ssim: mssim, combined, sizeScore,
           refW: refMeta.width, refH: refMeta.height,
           htxW: htxMeta.width, htxH: htxMeta.height };
}

(async () => {
  const baseResults = JSON.parse(fs.readFileSync('comparison/ssim-results.json','utf8'));
  const bm = {}; for (const r of baseResults) bm[r.id] = r;

  console.log('ID      Prev(ssim) New(ssim) ΔSsim   PrevCmb  NewCmb   Dims(ref/htx)');
  for (const id of IDS) {
    const r = await renderAndSsim(id);
    const prev = bm[id] || {};
    if (r.err) { console.log(id, 'ERR', r.err); continue; }
    const dSsim = r.ssim - (prev.ssim || 0);
    console.log(id,
      (prev.ssim || 0).toFixed(3),
      r.ssim.toFixed(3),
      (dSsim >= 0 ? '+' : '') + dSsim.toFixed(3),
      '  ',
      (prev.combined || 0).toFixed(3),
      r.combined.toFixed(3),
      '  ' + r.refW + 'x' + r.refH + '/' + r.htxW + 'x' + r.htxH);
  }
})();
