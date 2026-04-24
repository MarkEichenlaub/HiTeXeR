// Score just 01273 using same pipeline as _rerun_targets.js
'use strict';
const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ssim: computeSSIM } = require('ssim.js');

const ROOT        = __dirname;
const OUT_DIR     = path.join(ROOT, 'comparison');
const ASY_SRC_DIR = path.join(OUT_DIR, 'asy_src');
const TEXER_DIR   = path.join(OUT_DIR, 'texer_pngs');
const RASTER_DPI  = 144;
const KATEX_FONTS_DIR = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts');

const TARGET = process.argv[2] || '01273';

function buildFontFaceCSS() {
  const faces = [
    { family:'KaTeX_Main', style:'normal', weight:'normal', file:'KaTeX_Main-Regular.woff2' },
    { family:'KaTeX_Main', style:'italic', weight:'normal', file:'KaTeX_Main-Italic.woff2' },
    { family:'KaTeX_Main', style:'normal', weight:'bold',   file:'KaTeX_Main-Bold.woff2' },
    { family:'KaTeX_Main', style:'italic', weight:'bold',   file:'KaTeX_Main-BoldItalic.woff2' },
    { family:'KaTeX_Math', style:'normal', weight:'normal', file:'KaTeX_Math-Italic.woff2' },
    { family:'KaTeX_Math', style:'italic', weight:'normal', file:'KaTeX_Math-Italic.woff2' },
    { family:'KaTeX_Math', style:'normal', weight:'bold',   file:'KaTeX_Math-BoldItalic.woff2' },
    { family:'KaTeX_Math', style:'italic', weight:'bold',   file:'KaTeX_Math-BoldItalic.woff2' },
  ];
  let css = '';
  for (const f of faces) {
    const p = path.join(KATEX_FONTS_DIR, f.file);
    if (!fs.existsSync(p)) continue;
    const b64 = fs.readFileSync(p).toString('base64');
    css += `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }
  return css;
}

function embedFontsInSVG(svgStr, css) {
  if (svgStr.includes('<style>')) return svgStr.replace('<style>','<style>'+css);
  return svgStr.replace(/(^<svg[^>]*>)/, '$1<style>'+css+'</style>');
}

async function main() {
  global.window = {};
  global.document = { createElement: () => ({ getContext: () => null }) };
  const asyInterp = require('./asy-interp.js');

  const asyPath = path.join(ASY_SRC_DIR, TARGET + '.asy');
  const asySrc = fs.readFileSync(asyPath, 'utf8');
  let svg = window.AsyInterp.render(asySrc, { format: 'svg' });
  if (typeof svg === 'object' && svg && svg.svg) svg = svg.svg;

  const css = buildFontFaceCSS();
  const svgFull = embedFontsInSVG(svg, css);

  // Write SVG for inspection
  fs.writeFileSync(path.join(ROOT, `_score_${TARGET}.svg`), svgFull);

  // Rasterize
  const htxPng = await sharp(Buffer.from(svgFull), { density: RASTER_DPI })
    .png().toBuffer();
  const htxMeta = await sharp(htxPng).metadata();
  fs.writeFileSync(path.join(ROOT, `_score_${TARGET}_htx.png`), htxPng);

  const texerPath = path.join(TEXER_DIR, TARGET + '.png');
  const texerPng = fs.readFileSync(texerPath);
  const texerMeta = await sharp(texerPng).metadata();

  // Resize both to match (scale to smaller dim)
  const W = Math.min(htxMeta.width, texerMeta.width);
  const H = Math.min(htxMeta.height, texerMeta.height);

  const htxResized = await sharp(htxPng).flatten({background:'white'}).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const texerResized = await sharp(texerPng).flatten({background:'white'}).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  // ssim.js expects RGBA
  function rgbToRgba(rgb, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      out[j] = rgb[i]; out[j+1] = rgb[i+1]; out[j+2] = rgb[i+2]; out[j+3] = 255;
    }
    return out;
  }
  const img1 = { data: rgbToRgba(htxResized.data, W, H), width: W, height: H };
  const img2 = { data: rgbToRgba(texerResized.data, W, H), width: W, height: H };

  const { mssim } = computeSSIM(img1, img2);
  console.log(JSON.stringify({
    id: TARGET,
    ssim: mssim,
    htx: { w: htxMeta.width, h: htxMeta.height },
    texer: { w: texerMeta.width, h: texerMeta.height }
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
