'use strict';
// Render given diagram IDs to PNG via the SAME node pipeline the comparator uses
// (svg-native -> KaTeX SVG emitter -> sharp). Output: comparison/_htx_<id>.png
// Usage: node _renderpng.js 07601 10001 ...
const fs = require('fs'), path = require('path'), sharp = require('sharp');
global.window = {}; global.katex = require('katex'); require('./asy-interp.js');
const R = __dirname, SRC = path.join(R, 'comparison', 'asy_src');
const KF = path.join(R, 'node_modules', 'katex', 'dist', 'fonts');
const RDPI = 144;
function fontCSS() {
  const F = [['KaTeX_Main', 'normal', 'normal', 'KaTeX_Main-Regular.woff2'], ['KaTeX_Main', 'italic', 'normal', 'KaTeX_Main-Italic.woff2'], ['KaTeX_Main', 'normal', 'bold', 'KaTeX_Main-Bold.woff2'], ['KaTeX_Main', 'italic', 'bold', 'KaTeX_Main-BoldItalic.woff2'], ['KaTeX_Math', 'normal', 'normal', 'KaTeX_Math-Italic.woff2'], ['KaTeX_Math', 'italic', 'normal', 'KaTeX_Math-Italic.woff2'], ['KaTeX_Size1', 'normal', 'normal', 'KaTeX_Size1-Regular.woff2'], ['KaTeX_Size2', 'normal', 'normal', 'KaTeX_Size2-Regular.woff2'], ['KaTeX_Size3', 'normal', 'normal', 'KaTeX_Size3-Regular.woff2'], ['KaTeX_Size4', 'normal', 'normal', 'KaTeX_Size4-Regular.woff2'], ['KaTeX_AMS', 'normal', 'normal', 'KaTeX_AMS-Regular.woff2']];
  let c = ''; for (const [f, s, w, fl] of F) { const p = path.join(KF, fl); if (!fs.existsSync(p)) continue; c += `@font-face{font-family:"${f}";font-style:${s};font-weight:${w};src:url("data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}") format("woff2");}`; } return c;
}
function expandVB(s) {
  if (s.indexOf('clip-path="url(#user-clip)"') !== -1) return s;
  const m = s.match(/viewBox="([^"]+)"/); if (!m) return s;
  let [vx, vy, vw, vh] = m[1].split(/\s+/).map(Number);
  let mnx = vx, mny = vy, mxx = vx + vw, mxy = vy + vh;
  const fo = /<foreignObject\s[^>]*?\bx="([^"]+)"[^>]*?\by="([^"]+)"[^>]*?\bwidth="([^"]+)"[^>]*?\bheight="([^"]+)"[^>]*>/g; let f;
  while ((f = fo.exec(s))) { const x = +f[1], y = +f[2], w = +f[3], h = +f[4]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (x + w > mxx) mxx = x + w; if (y + h > mxy) mxy = y + h; }
  const nx = Math.min(vx, mnx), ny = Math.min(vy, mny), nw = Math.max(vx + vw, mxx) - nx, nh = Math.max(vy + vh, mxy) - ny;
  if (nx === vx && ny === vy && nw === vw && nh === vh) return s;
  const ft = n => +n.toFixed(4);
  let r = s.replace(m[0], `viewBox="${ft(nx)} ${ft(ny)} ${ft(nw)} ${ft(nh)}"`);
  const wm = r.match(/\bwidth="([^"]+)"/), hm = r.match(/\bheight="([^"]+)"/);
  if (wm && hm) r = r.replace(wm[0], `width="${ft(+wm[1] * (nw / vw))}"`).replace(hm[0], `height="${ft(+hm[1] * (nh / vh))}"`);
  return r;
}
function embed(s, c) { return s.includes('<style>') ? s.replace('<style>', '<style>' + c) : s.replace(/(^<svg[^>]*>)/, '$1<style>' + c + '</style>'); }
const FC = fontCSS();
(async () => {
  for (const id of process.argv.slice(2)) {
    try {
      const src = fs.readFileSync(path.join(SRC, id + '.asy'), 'utf8');
      const r = global.window.AsyInterp.render('[asy]\n' + src + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
      let svg = r.svg;
      const iw = svg.match(/data-intrinsic-w="([^"]+)"/), ih = svg.match(/data-intrinsic-h="([^"]+)"/);
      if (iw && ih) svg = svg.replace(/(<svg[^>]*)\bwidth="[^"]*"/, `$1width="${iw[1]}"`).replace(/(<svg[^>]*)\bheight="[^"]*"/, `$1height="${ih[1]}"`);
      svg = embed(expandVB(svg), FC);
      const buf = await sharp(Buffer.from(svg, 'utf8'), { density: RDPI }).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer();
      const out = path.join(R, 'comparison', '_htx_' + id + '.png');
      fs.writeFileSync(out, buf);
      console.log(id, 'wrote', out, buf.length, 'bytes');
    } catch (e) { console.log(id, 'ERR', e.message); }
  }
})();
