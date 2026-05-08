const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = global.window || {};
global.katex = require('katex');
require(path.join(ROOT, 'asy-interp.js'));
const A = global.window.AsyInterp;
const raw = fs.readFileSync(path.join(ROOT, 'comparison/asy_src/12866.asy'), 'utf8');
const interp = A._createInterpreter();
const result = interp.execute('[asy]\n' + raw + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
console.log('sizeW=', result.sizeW, 'sizeH=', result.sizeH, 'keepAspect=', result.keepAspect, 'hasUnitScale=', result.hasUnitScale);
const r = A._renderSVG(result, { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
console.log('minX=', r.minX, 'maxX=', r.maxX, 'minY=', r.minY, 'maxY=', r.maxY);
console.log('pxPerUnitX=', r.pxPerUnitX, 'pxPerUnitY=', r.pxPerUnitY);

// Find commands with extreme coordinates
const cmds = result.drawCommands;
console.log('Total commands:', cmds.length);

// Find actual min/max across all commands (matching renderSVG's expandBezierBBox)
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

function expandBezierBBox(seg) {
  // Include endpoints and control points
  for (const p of [seg.p0, seg.cp1, seg.cp2, seg.p3]) {
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Find extrema in x and y (same as renderSVG)
  for (let dim = 0; dim < 2; dim++) {
    const key = dim === 0 ? 'x' : 'y';
    const p0 = seg.p0[key], p1 = seg.cp1[key], p2 = seg.cp2[key], p3 = seg.p3[key];
    const a = -3*p0+9*p1-9*p2+3*p3, b = 6*p0-12*p1+6*p2, c = 3*p1-3*p0;
    if (Math.abs(a) > 1e-12) {
      const disc = b*b-4*a*c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-b+sq)/(2*a), (-b-sq)/(2*a)]) {
          if (t > 0 && t < 1) {
            const u=1-t;
            const val = u*u*u*seg.p0[key]+3*u*u*t*seg.cp1[key]+3*u*t*t*seg.cp2[key]+t*t*t*seg.p3[key];
            if (dim===0) { if(val<minX)minX=val; if(val>maxX)maxX=val; }
            else { if(val<minY)minY=val; if(val>maxY)maxY=val; }
          }
        }
      }
    } else if (Math.abs(b) > 1e-12) {
      const t = -c/b;
      if (t > 0 && t < 1) {
        const u=1-t;
        const val = u*u*u*seg.p0[key]+3*u*u*t*seg.cp1[key]+3*u*t*t*seg.cp2[key]+t*t*t*seg.p3[key];
        if (dim===0) { if(val<minX)minX=val; if(val>maxX)maxX=val; }
        else { if(val<minY)minY=val; if(val>maxY)maxY=val; }
      }
    }
  }
}

for (let i = 0; i < cmds.length; i++) {
  const dc = cmds[i];
  if (dc.cmd === 'dot') {
    const x = dc.pos.x, y = dc.pos.y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  } else if (dc.cmd === 'label') {
    const x = dc.pos.x, y = dc.pos.y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  } else if (dc.path) {
    // Skip conditions as in renderSVG
    if (dc.cmd === 'fill' && dc.pen && dc.pen.r >= 0.99 && dc.pen.g >= 0.99 && dc.pen.b >= 0.99) continue;
    if (dc._isTickMark) continue;
    if (dc._extendedLine) continue;
    if (dc.cmd === 'clip') continue;
    if (dc.path._singlePoint) {
      const x = dc.path._singlePoint.x, y = dc.path._singlePoint.y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    for (const seg of dc.path.segs) expandBezierBBox(seg);
  }
}
console.log('Commands bbox (full bezier):', { minX: minX.toFixed(2), maxX: maxX.toFixed(2), minY: minY.toFixed(2), maxY: maxY.toFixed(2) });
console.log('Expected ~0 to ~650 in x, ~0 to ~880 in y');

// Where does the renderer get its bbox?
console.log('Renderer bbox:', r.minX.toFixed(2), r.maxX.toFixed(2), r.minY.toFixed(2), r.maxY.toFixed(2));

// Look for labels with extreme positions
const labels = cmds.filter(dc => dc.cmd === 'label');
console.log('Number of labels:', labels.length);
let minLX = Infinity, maxLX = -Infinity;
for (const dc of labels) {
  if (dc.pos.x < minLX) minLX = dc.pos.x;
  if (dc.pos.x > maxLX) maxLX = dc.pos.x;
}
console.log('Label X range:', minLX.toFixed(2), 'to', maxLX.toFixed(2));

// Check a few labels for their alignment
for (let i = 0; i < Math.min(3, labels.length); i++) {
  const lbl = labels[i];
  console.log('Label', i, ':', JSON.stringify({
    pos: {x: lbl.pos.x.toFixed(2), y: lbl.pos.y.toFixed(2)},
    align: lbl.align ? {x: lbl.align.x.toFixed(2), y: lbl.align.y.toFixed(2)} : null,
    text: lbl.text
  }));
}

// Check for dots with extreme positions
const dots = cmds.filter(dc => dc.cmd === 'dot');
console.log('Number of dots:', dots.length);
if (dots.length > 0) {
  let minDX = Infinity, maxDX = -Infinity;
  for (const dc of dots) {
    if (dc.pos.x < minDX) minDX = dc.pos.x;
    if (dc.pos.x > maxDX) maxDX = dc.pos.x;
  }
  console.log('Dot X range:', minDX.toFixed(2), 'to', maxDX.toFixed(2));
}

// Check labels for labelTransform
console.log('Checking labels for labelTransform...');
let labelWithTransform = 0;
for (const dc of labels) {
  if (dc.labelTransform) {
    labelWithTransform++;
    const lt = dc.labelTransform;
    const ltScale = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
    if (labelWithTransform <= 3) {
      console.log('Label with transform:', dc.text, 'scale=', ltScale.toFixed(2), 'transform=', JSON.stringify(lt));
    }
  }
}
console.log('Labels with transform:', labelWithTransform, 'of', labels.length);

// Simulate the label expansion to find the culprit
let simMinX = Infinity, simMaxX = -Infinity;
let culprit = null;
for (const dc of labels) {
  const pos = dc.pos;
  let fontSize = (dc.pen && dc.pen.fontsize) || 10;
  // Apply labelTransform scale
  if (dc.labelTransform) {
    const lt = dc.labelTransform;
    const ltScale = Math.sqrt(lt.b * lt.b + lt.e * lt.e);
    if (ltScale > 0 && Math.abs(ltScale - 1) > 0.01) fontSize *= ltScale;
  }
  const charWidthBp = fontSize * 0.288;
  const charWidthUser = charWidthBp / 1;  // roughPxPerUnitX = 1
  const text = dc.text || '';
  const effectiveLen = text.length || 1;
  let textWidthBpBase = effectiveLen * charWidthBp;
  // Apply 0.52 floor
  const _renderWidthBpFloor = effectiveLen * fontSize * 0.52;
  if (_renderWidthBpFloor > textWidthBpBase) textWidthBpBase = _renderWidthBpFloor;
  const textWidthUser = textWidthBpBase / 1;
  const textHeightUser = fontSize * 0.65 / 1;

  let dx = 0;
  if (dc.align) {
    const ax = dc.align.x, ay = dc.align.y;
    const marginX = 0.40 * fontSize / 1;
    const aInfMax = Math.max(Math.abs(ax), Math.abs(ay));
    const ax_n = aInfMax > 0 ? (ax * 0.5 / aInfMax) : 0;
    dx = ax_n * textWidthUser + ax * marginX;
  }

  const cx = pos.x + dx;
  const lbMinX = cx - textWidthUser/2;
  const lbMaxX = cx + textWidthUser/2;

  if (lbMinX < simMinX) {
    simMinX = lbMinX;
    culprit = { text: dc.text, pos: dc.pos, align: dc.align, cx, lbMinX };
  }
  if (lbMaxX > simMaxX) simMaxX = lbMaxX;
}
console.log('Simulated label expansion: minX=', simMinX.toFixed(2), 'maxX=', simMaxX.toFixed(2));
if (culprit) {
  console.log('Culprit label:', JSON.stringify(culprit, (k, v) => typeof v === 'number' ? v.toFixed(2) : v));
}
