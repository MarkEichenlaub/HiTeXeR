'use strict';
// Headless-Chromium (Blink/Skia) SVG -> PNG rasterizer.
//
// This is the SAME engine the user sees in comparison/blink.html: the SVG is
// injected inline (innerHTML) into a white page that links the local KaTeX
// stylesheet, so KaTeX_Math / KaTeX_Main glyphs render with the real fonts and
// the exact metrics/positioning the user observes — unlike librsvg, which uses
// base64-embedded fonts and a different text layout engine.
//
// One warm browser is reused across many IDs in a run (launch is the slow part).
// Callers MUST invoke closeBrowser() when done so the process can exit.

const fs   = require('fs');
const path = require('path');
const url  = require('url');

// librsvg @ 144 density treats the SVG's px dimensions as points (72/in), an
// effective 2x. We render Blink at the same factor so PNG pixel dims — and thus
// the sizeScore in render-and-score.js — stay comparable to the librsvg path
// and to the 240-DPI TeXeR reference PNGs.
const DEFAULT_SCALE = 2;

const KATEX_CSS_PATH = path.join(__dirname, 'node_modules', 'katex', 'dist', 'katex.min.css');
const KATEX_CSS_URL  = url.pathToFileURL(KATEX_CSS_PATH).href;

let _browser = null;
let _launching = null;

async function getBrowser() {
  if (_browser) return _browser;
  if (_launching) return _launching;
  const puppeteer = require('puppeteer');
  _launching = puppeteer.launch({
    headless: 'new',
    args: [
      '--force-color-profile=srgb',   // deterministic colour, matches sRGB PNGs
      '--disable-lcd-text',           // grayscale AA -> reproducible glyph edges
      '--hide-scrollbars',
      '--no-sandbox',
    ],
  }).then(b => { _browser = b; _launching = null; return b; });
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
      `<link rel="stylesheet" href="${KATEX_CSS_URL}">` +
      '<style>*{margin:0;padding:0;box-sizing:border-box}' +
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
