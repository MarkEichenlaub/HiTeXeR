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

// ── Optical-size outline overrides ──────────────────────────────────────────
// KaTeX ships Computer Modern at the 10pt DESIGN for every size, but TeXeR's
// LaTeX uses optically-sized cmr12 for the default 12pt labels — thinner
// stems, narrower digits. Swapping ONLY the painted outlines to the Latin
// Modern 12pt-design faces (metric twins of cmr12) while KEEPING KaTeX's
// advance metrics leaves every layout/alignment/fit decision untouched; each
// glyph is optically centered inside its KaTeX advance cell. Display-scale
// digit ink measured +28% vs TeXeR before this (05904).
// Fonts come from the local MiKTeX tree; when absent the override is skipped
// and the KaTeX outline is kept (portable builds).
const LM_DIR = 'C:/Users/Mark Eichenlaub/AppData/Local/Programs/MiKTeX/fonts/opentype/public/lm';
const OPTICAL_OVERRIDES = {
  'KaTeX_Main-Regular': path.join(LM_DIR, 'lmroman12-regular.otf'),
  'KaTeX_Main-Bold': path.join(LM_DIR, 'lmroman12-bold.otf'),
  'KaTeX_Main-Italic': path.join(LM_DIR, 'lmroman12-italic.otf'),
};

function glyphToPathShifted(glyph, dx) {
  const p = glyph.getPath(dx, 0, 1000);
  let d = '';
  for (const c of p.commands) {
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
  let ovFont = null;
  if (OPTICAL_OVERRIDES[face] && fs.existsSync(OPTICAL_OVERRIDES[face])) {
    try {
      const ob = fs.readFileSync(OPTICAL_OVERRIDES[face]);
      ovFont = opentype.parse(ob.buffer.slice(ob.byteOffset, ob.byteOffset + ob.byteLength));
    } catch (e) { console.warn('override parse failed for', face, e.message); }
  }
  const ovScale = ovFont ? 1000 / ovFont.unitsPerEm : 1;
  let overridden = 0;
  const table = {};
  const glyphCount = font.glyphs.length;
  for (let i = 0; i < glyphCount; i++) {
    const g = font.glyphs.get(i);
    if (g.unicode === undefined && (!g.unicodes || g.unicodes.length === 0)) continue;
    const codes = g.unicodes && g.unicodes.length ? g.unicodes : [g.unicode];
    let d = glyphToPath(g, upem * scale === 1000 ? 1000 : 1000); // normalized below
    // normalize coordinates to 1000 upem if needed
    const adv = Math.round(g.advanceWidth * scale * 10) / 10;
    if (ovFont) {
      const _u0 = codes.find(u => u != null);
      if (_u0 != null) {
        const ovG = ovFont.charToGlyph(String.fromCodePoint(_u0));
        if (ovG && ovG.index !== 0) {
          const ovPath = ovG.getPath(0, 0, 1000);
          if (ovPath.commands && ovPath.commands.length > 0) {
            const ovAdv = ovG.advanceWidth * ovScale;
            const dx = (adv - ovAdv) / 2;   // center in the KaTeX advance cell
            d = glyphToPathShifted(ovG, dx);
            overridden++;
          }
        }
      }
    }
    for (const u of codes) {
      if (u == null) continue;
      table[String.fromCodePoint(u)] = { p: d, a: adv };
      totalGlyphs++;
    }
  }
  out.faces[face] = table;
  console.log(face, Object.keys(table).length, 'glyphs, upem', upem, ovFont ? ('(' + overridden + ' outlines from ' + path.basename(OPTICAL_OVERRIDES[face]) + ')') : '');
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB,', totalGlyphs, 'glyph entries');
