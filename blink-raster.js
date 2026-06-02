'use strict';
// Headless-Chromium (Blink/Skia) SVG -> PNG rasterizer.
//
// This is the SAME engine the user sees in comparison/blink.html. The SVG text
// requests `font-family="KaTeX_Main, serif"` / `KaTeX_Math, serif`; we provide
// those faces as base64-embedded @font-face rules so the glyphs are the real
// KaTeX (Computer-Modern) shapes — NOT the `serif` (Times) fallback. Embedding
// (rather than a <link> to the on-disk katex.min.css) is deliberate: headless
// Chromium blocks file:// font subresources, which silently dropped us to the
// Times fallback and made axis numbers / italic letters render with the wrong
// font.
//
// One warm browser is reused across many IDs in a run (launch is the slow part).
// Callers MUST invoke closeBrowser() when done so the process can exit.

const fs   = require('fs');
const path = require('path');

// librsvg @ 144 density treats the SVG's px dimensions as points (72/in), an
// effective 2x. We render Blink at the same factor so PNG pixel dims — and thus
// the sizeScore in render-and-score.js — stay comparable to the librsvg path
// and to the 240-DPI TeXeR reference PNGs.
const DEFAULT_SCALE = 2;

const KATEX_FONTS_DIR = path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');

// Base64-embedded KaTeX @font-face block (same face set as the librsvg scorer in
// auto-fix/render-and-score.js). Built once and cached.
let _fontCSS = null;
function fontFaceCSS() {
  if (_fontCSS != null) return _fontCSS;
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
    css += `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};`
        +  `src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }
  _fontCSS = css;
  return css;
}

let _browser = null;
let _launching = null;

// opts.executablePath lets callers point at a specific Chromium-family browser
// (e.g. the user's Brave) to verify the bundled Chromium renders identically.
async function getBrowser(opts) {
  opts = opts || {};
  if (_browser) return _browser;
  if (_launching) return _launching;
  const puppeteer = require('puppeteer');
  const launch = {
    headless: 'new',
    args: [
      '--force-color-profile=srgb',   // deterministic colour, matches sRGB PNGs
      '--disable-lcd-text',           // grayscale AA -> reproducible glyph edges
      '--hide-scrollbars',
      '--no-sandbox',
    ],
  };
  if (opts.executablePath) launch.executablePath = opts.executablePath;
  _launching = puppeteer.launch(launch).then(b => { _browser = b; _launching = null; return b; });
  return _launching;
}

async function closeBrowser() {
  if (_browser) {
    const b = _browser;
    _browser = null;
    try { await b.close(); } catch (e) {}
  }
}

// Pull the SVG's declared pixel dimensions so we can size the viewport. Falls
// back to the data-intrinsic-* hints, then to a sane default.
function svgPixelDims(svgText) {
  const wm = svgText.match(/<svg[^>]*\bwidth="([\d.]+)/);
  const hm = svgText.match(/<svg[^>]*\bheight="([\d.]+)/);
  if (wm && hm) return { w: Math.ceil(parseFloat(wm[1])), h: Math.ceil(parseFloat(hm[1])) };
  const iw = svgText.match(/data-intrinsic-w="([\d.]+)"/);
  const ih = svgText.match(/data-intrinsic-h="([\d.]+)"/);
  if (iw && ih) return { w: Math.ceil(parseFloat(iw[1])), h: Math.ceil(parseFloat(ih[1])) };
  return { w: 800, h: 600 };
}

// Rasterize an HiTeXeR SVG string to a PNG Buffer via Blink, on white.
async function rasterizeSVG(svgText, opts) {
  opts = opts || {};
  const scale = opts.scale || DEFAULT_SCALE;
  const { w, h } = svgPixelDims(svgText);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: Math.max(w, 1), height: Math.max(h, 1), deviceScaleFactor: scale });

    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' + fontFaceCSS() +
      '*{margin:0;padding:0;box-sizing:border-box}' +
      'html,body{background:#fff}' +
      '#stage{display:inline-block;background:#fff}' +
      '#stage svg{display:block}</style></head>' +
      '<body><div id="stage">' + svgText + '</div></body></html>';

    await page.setContent(html, { waitUntil: 'load' });
    // Ensure KaTeX woff2 are parsed/loaded before we shoot.
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const el = await page.$('#stage svg') || await page.$('#stage');
    const png = await el.screenshot({ type: 'png', omitBackground: false });
    return png;
  } finally {
    await page.close();
  }
}

module.exports = { getBrowser, closeBrowser, rasterizeSVG, DEFAULT_SCALE };
