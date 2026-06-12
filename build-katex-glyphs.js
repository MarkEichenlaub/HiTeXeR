'use strict';
// Build step: extract glyph outlines from the KaTeX TTF fonts into
// katex-glyphs.json, consumed by katex-svg.js (the KaTeX SVG emitter).
//
//   node build-katex-glyphs.js
//
// Output format:
//   { upem: 1000,
//     faces: { "KaTeX_Main-Regular": { "<char>": { p: "<svg path in font units, y-UP>", a: <advance> }, ... }, ... } }
//
// Paths are kept in integer font units (upem=1000 for the KaTeX faces) to keep
// the JSON compact; katex-svg.js scales by fontSize/upem and flips y.
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const FONTS_DIR = path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts');
const OUT = path.join(__dirname, 'katex-glyphs.json');

const FACES = [
  'KaTeX_AMS-Regular',
  'KaTeX_Caligraphic-Bold', 'KaTeX_Caligraphic-Regular',
  'KaTeX_Fraktur-Bold', 'KaTeX_Fraktur-Regular',
  'KaTeX_Main-Bold', 'KaTeX_Main-BoldItalic', 'KaTeX_Main-Italic', 'KaTeX_Main-Regular',
  'KaTeX_Math-BoldItalic', 'KaTeX_Math-Italic',
  'KaTeX_SansSerif-Bold', 'KaTeX_SansSerif-Italic', 'KaTeX_SansSerif-Regular',
  'KaTeX_Script-Regular',
  'KaTeX_Size1-Regular', 'KaTeX_Size2-Regular', 'KaTeX_Size3-Regular', 'KaTeX_Size4-Regular',
  'KaTeX_Typewriter-Regular',
];

function glyphToPath(glyph, upem) {
  // opentype path commands are in font units with y-UP already.
  const p = glyph.getPath(0, 0, upem); // fontSize=upem → coordinates in font units
  let d = '';
  for (const c of p.commands) {
    // getPath emits y-DOWN screen coords; flip back to y-up font units and round.
    const f = (n) => Math.round(n * 10) / 10;
    if (c.type === 'M') d += `M${f(c.x)} ${f(-c.y)}`;
    else if (c.type === 'L') d += `L${f(c.x)} ${f(-c.y)}`;
    else if (c.type === 'Q') d += `Q${f(c.x1)} ${f(-c.y1)} ${f(c.x)} ${f(-c.y)}`;
    else if (c.type === 'C') d += `C${f(c.x1)} ${f(-c.y1)} ${f(c.x2)} ${f(-c.y2)} ${f(c.x)} ${f(-c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

const out = { upem: 1000, faces: {} };
let totalGlyphs = 0;
for (const face of FACES) {
  const file = path.join(FONTS_DIR, face + '.ttf');
  if (!fs.existsSync(file)) { console.warn('missing', file); continue; }
  const buf = fs.readFileSync(file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const upem = font.unitsPerEm;
  const scale = 1000 / upem;
  const table = {};
  const glyphCount = font.glyphs.length;
  for (let i = 0; i < glyphCount; i++) {
    const g = font.glyphs.get(i);
    if (g.unicode === undefined && (!g.unicodes || g.unicodes.length === 0)) continue;
    const codes = g.unicodes && g.unicodes.length ? g.unicodes : [g.unicode];
    const d = glyphToPath(g, upem * scale === 1000 ? 1000 : 1000); // normalized below
    // normalize coordinates to 1000 upem if needed
    const adv = Math.round(g.advanceWidth * scale * 10) / 10;
    for (const u of codes) {
      if (u == null) continue;
      table[String.fromCodePoint(u)] = { p: d, a: adv };
      totalGlyphs++;
    }
  }
  out.faces[face] = table;
  console.log(face, Object.keys(table).length, 'glyphs, upem', upem);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB,', totalGlyphs, 'glyph entries');
