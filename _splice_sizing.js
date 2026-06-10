// One-shot splice: replace the unitsize-branch heuristics in asy-interp.js
// with the true TeXeR/Asymptote fit2 semantics. Anchored on unique markers;
// verifies counts before writing.
const fs = require('fs');
const F = 'asy-interp.js';
let src = fs.readFileSync(F, 'utf8');

const A = '  if (hasUnitScale) {\r\n    // unitsize() was called: user coords → bp directly (labels just expand output)';
const B = '  } else if (sizeW > 0 || sizeH > 0) {\r\n    // size() without unitsize(): scale geometry to fit the requested size.';

const ia = src.indexOf(A);
const ib = src.indexOf(B);
if (ia < 0 || ib < 0 || ib <= ia) { console.error('anchor fail', ia, ib); process.exit(1); }
// sanity: the replaced region should contain the boost tower + PL/CP fits
const region = src.slice(ia, ib);
for (const must of ['PL_FIT_BP', 'CP_FIT_BP', '_graphIdiomBoost', '_crowdRequiresBoost']) {
  if (!region.includes(must)) { console.error('region missing ' + must + ' — wrong span'); process.exit(1); }
}
console.error('replacing', region.split('\n').length, 'lines');

const NEW = `  // ─── True TeXeR sizing (Asymptote fit2 semantics) ────────────────────────
  // Helper shared by the pass-2 refits below: measure the full frame span
  // (geometry bbox + truesize label boxes) in bp at a candidate geometry
  // scale. Mirrors the iterative solver's span math further down.
  const _spanAtScaleBp = (sx, sy) => {
    let bMinX = geoMinX * sx, bMaxX = geoMaxX * sx;
    let bMinY = geoMinY * sy, bMaxY = geoMaxY * sy;
    for (const li of labelInfoBp) {
      const cx = li.posX * sx + li.alignOffsetXBp;
      const cy = li.posY * sy + li.alignOffsetYBp;
      if (cx - li.widthBp / 2 < bMinX) bMinX = cx - li.widthBp / 2;
      if (cx + li.widthBp / 2 > bMaxX) bMaxX = cx + li.widthBp / 2;
      if (cy - li.heightBp / 2 < bMinY) bMinY = cy - li.heightBp / 2;
      if (cy + li.heightBp / 2 > bMaxY) bMaxY = cy + li.heightBp / 2;
    }
    return { w: bMaxX - bMinX, h: bMaxY - bMinY };
  };
  // Inexact-bounds detection, mirroring Asymptote's bounds.exact=false: any
  // deferred drawer added with exact=false flips the picture into fit2's
  // pass-2 corrective rescale at shipout. The 2D triggers (read from the
  // Asymptote 3.05 sources, verified against live TeXeR 2026-06-10):
  //   • a path label with RELATIVE alignment — draw("$x$", path) with no
  //     align arg (plain_Label.asy out(picture,path): exact = !alignrelative)
  //   • graph.asy axes — xaxis/yaxis/axis add drawerBounds with default
  //     exact=false (auto AND fixed ranges)
  //   • currentpicture = transform*currentpicture (picture.transformed sets
  //     bounds.exact=false; plain add(picture) does NOT propagate inexact,
  //     which is also why path labels living inside an add()ed sub-picture
  //     do NOT trigger — approximated here by the _usedPictureComposite
  //     exemption, e.g. 06064 stays literal)
  // Plain draws/fills/dots/point-labels/arrows are exact.
  const _boundsInexact =
    (!_usedPictureComposite && drawCommands.some(dc => dc && dc._fromPathLabelNoAlign))
    || drawCommands.some(dc => dc && dc._isAxisLine)
    || _usedCurrentpictureReassign;
  if (hasUnitScale) {
    // unitsize(): the pass-1 scaling is the literal unit scale — real
    // Asymptote honors it exactly (no boost, no floor, no cap) whenever the
    // picture's bounds are exact (bounds.scaling: sx = xunitsize). The former
    // boost tower fired on exact unitsize pictures and is gone deliberately.
    pxPerUnit = pxPerUnitX = pxPerUnitY = unitScale;
    // When size() is also explicitly set, use it to govern the geometry scale.
    // Real Asymptote/TeXeR scales 3D diagrams (and others with both set) to the
    // requested size() regardless of unitsize(), so size() acts as an override.
    // EXCEPTION: truesize frame content (add(frame)) keeps its absolute bp
    // dimensions and must not be rescaled by a picture-level size() — e.g. a
    // composition of pre-fit sub-pictures added as a frame (00778).
    if (!_trueSizeFrame && (sizeW > 0 || sizeH > 0)) {
      const _sw = sizeW > 0 ? sizeW : Infinity;
      const _sh = sizeH > 0 ? sizeH : Infinity;
      const _gW = (geoMaxX - geoMinX) || 1;
      const _gH = (geoMaxY - geoMinY) || 1;
      pxPerUnit = pxPerUnitX = pxPerUnitY = Math.min(_sw / _gW, _sh / _gH);
    } else if (!_trueSizeFrame && !_is3D && _boundsInexact) {
      // TRUE TeXeR pass-2 (fit2's corrective rescale, one step): re-measure
      // the literal frame (geometry + truesize labels) and rescale the
      // GEOMETRY by min(400/W, 400/H) — grow or shrink — then truesize
      // content re-adds itself downstream. The effective target is the TeXeR
      // wrapper's prepended size(400,400); a user size() is handled in the
      // branch above, and the 150bp appended default never applies because
      // "unitsize(" always matches the server's size-text regex. This single
      // step IS the empirically observed "saturating fit toward ~400bp":
      // label-heavy pictures land well below 400 because the truesize boxes
      // re-expand the frame after the grow. Replaces the former boost tower
      // and the saturating path-label / currentpicture-reassign fits
      // (memory: project_texer_pathlabel_sizing).
      const FIT2_TARGET_BP = 400;
      const _sp = _spanAtScaleBp(unitScale, unitScale);
      const _grows = [];
      if (_sp.w > 1e-9) _grows.push(FIT2_TARGET_BP / _sp.w);
      if (_sp.h > 1e-9) _grows.push(FIT2_TARGET_BP / _sp.h);
      if (_grows.length) {
        const g = Math.min(..._grows);
        if (isFinite(g) && g > 0 && Math.abs(g - 1) > 0.002) {
          pxPerUnit = pxPerUnitX = pxPerUnitY = unitScale * g;
          unitsizeBoostScale = g;
        }
      }
    }
`;

src = src.slice(0, ia) + NEW.replace(/\n/g, '\r\n') + src.slice(ib);
fs.writeFileSync(F, src);
console.error('spliced OK');
