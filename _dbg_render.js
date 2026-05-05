'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const KATEX_FONTS_DIR = path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');

function buildFontFaceCSS() {
  const faces = [
    { family: 'KaTeX_Main', style: 'normal', weight: 'normal', file: 'KaTeX_Main-Regular.woff2' },
    { family: 'KaTeX_Main', style: 'italic', weight: 'normal', file: 'KaTeX_Main-Italic.woff2' },
    { family: 'KaTeX_Main', style: 'normal', weight: 'bold',   file: 'KaTeX_Main-Bold.woff2' },
    { family: 'KaTeX_Math', style: 'normal', weight: 'normal', file: 'KaTeX_Math-Italic.woff2' },
  ];
  let css = '';
  for (const f of faces) {
    const fp = path.join(KATEX_FONTS_DIR, f.file);
    if (!fs.existsSync(fp)) continue;
    const b64 = fs.readFileSync(fp).toString('base64');
    css += `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }
  return css;
}

const inFile = process.argv[2];
const outFile = process.argv[3];
let svg = fs.readFileSync(inFile, 'utf8');
const css = buildFontFaceCSS();
svg = svg.replace(/(<svg[^>]*>)/, '$1<defs><style>' + css + '</style></defs>');
sharp(Buffer.from(svg), { density: 144 }).png().toFile(outFile).then(() => console.log('Wrote', outFile));
