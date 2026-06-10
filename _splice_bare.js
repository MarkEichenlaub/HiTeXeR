// Splice 2: replace the bare-branch (no size/unitsize) heuristic floors with
// the true Asymptote LP fit. Anchored; verifies before writing.
const fs = require('fs');
const F = 'asy-interp.js';
let src = fs.readFileSync(F, 'utf8');

const A = "    const defaultSize = _texerSizeTextMatch ? 400 : 150;";
const B = "    warnings.push('auto-scaled');";

const ia = src.indexOf(A);
const ib = src.indexOf(B);
if (ia < 0 || ib < 0 || ib <= ia) { console.error('anchor fail', ia, ib); process.exit(1); }
if (src.indexOf(A, ia + 1) >= 0 || src.indexOf(B, ib + 1) >= 0) { console.error('anchor not unique'); process.exit(1); }
const region = src.slice(ia, ib);
for (const must of ['_isLargeSquareRadial', '_autoFloorApplied', 'estOvershoot', '_shortLabelFit']) {
  if (!region.includes(must)) { console.error('region missing ' + must + ' — wrong span'); process.exit(1); }
}
console.error('replacing', region.split('\n').length, 'lines of bare-branch heuristics');

const NEW = `    const defaultSize = _texerSizeTextMatch ? 400 : 150;
    // TRUE Asymptote pass-1 LP (plain_scaling.asy calculateScaling): maximize
    // the geometry scale a such that every ordered pair of picture coords —
    // geometry bbox corners (± stroke margin), truesize label boxes anchored
    // at user points, and dot disks — spans ≤ D per axis:
    //   ∀ i,j:  a·(u_j − u_i) + (hi_j − lo_i) ≤ D.
    // keepAspect ⇒ min(sx, sy). Unbounded axes (all coords at one u, e.g.
    // label-only pictures) return 0 and fall back to the other axis, or to
    // natural scale 1 when both are unbounded — matching asy's behavior.
    // Infeasible (truesize content alone exceeds D) ⇒ retry at D×√2,
    // mirroring asy's "cannot fit ... enlarging" loop. This replaces the
    // former per-family floors/density gates (06387, 01153, 04777, 07413,
    // 00999, 04031, 04747, 11404-06, 03668, 04331 ...) with the single rule
    // they all approximated.
    const scaleRefW2 = (geoMaxX - geoMinX) || 1;
    const scaleRefH2 = (geoMaxY - geoMinY) || 1;
    const _lwPad = 0.25; // default-pen stroke margin (lw 0.5 / 2)
    const _xsLp = [{ u: geoMinX, lo: -_lwPad, hi: _lwPad }, { u: geoMaxX, lo: -_lwPad, hi: _lwPad }];
    const _ysLp = [{ u: geoMinY, lo: -_lwPad, hi: _lwPad }, { u: geoMaxY, lo: -_lwPad, hi: _lwPad }];
    for (const li of labelInfoBp) {
      if (typeof li.posX !== 'number' || typeof li.posY !== 'number') continue;
      const wCal = li.widthBp * _TEXER_LBL_W_CAL;
      _xsLp.push({ u: li.posX, lo: li.alignOffsetXBp - wCal / 2, hi: li.alignOffsetXBp + wCal / 2 });
      _ysLp.push({ u: li.posY, lo: li.alignOffsetYBp - li.heightBp / 2, hi: li.alignOffsetYBp + li.heightBp / 2 });
    }
    for (const dc of drawCommands) {
      if (dc.cmd !== 'dot' || !dc.pos || typeof dc.pos.x !== 'number') continue;
      const dotLw = (dc.pen && dc.pen.linewidth) || 0.5;
      const _direct = dc.pen && dc.pen._lwExplicit && dotLw >= 1;
      const dR = (_direct ? 0.5 : dotfactor / 2) * dotLw;
      _xsLp.push({ u: dc.pos.x, lo: -dR, hi: dR });
      _ysLp.push({ u: dc.pos.y, lo: -dR, hi: dR });
    }
    const _lpAxis = (cs, D) => {
      let best = Infinity;
      for (const ci of cs) {
        for (const cj of cs) {
          const du = cj.u - ci.u;
          const dt = cj.hi - ci.lo;
          if (du > 1e-12) { const c = (D - dt) / du; if (c < best) best = c; }
          else if (du > -1e-12 && dt > D) return -1; // scale-independent overflow
        }
      }
      if (best === Infinity) return 0; // unbounded (no extent on this axis)
      return best > 0 ? best : -1;
    };
    let _Dfit = defaultSize;
    let _sxLp = 0, _syLp = 0;
    for (let tries = 0; tries < 12; tries++) {
      _sxLp = _lpAxis(_xsLp, _Dfit);
      _syLp = _lpAxis(_ysLp, _Dfit);
      if (_sxLp === -1 || _syLp === -1) { _Dfit *= Math.SQRT2; continue; }
      break;
    }
    if (_sxLp === -1 || _syLp === -1) { _sxLp = _syLp = 1; }
    if (_sxLp === 0 && _syLp === 0) { _sxLp = _syLp = 1; } // pure-truesize: natural
    else if (_sxLp === 0) _sxLp = _syLp;
    else if (_syLp === 0) _syLp = _sxLp;
    pxPerUnit = pxPerUnitX = pxPerUnitY = Math.min(_sxLp, _syLp);
    // Multi-picture composite true-bp floor (kept from the legacy pile): the
    // stored refs render no-size add(picture) composites at TRUE bp scale
    // (08867: 472bp geometry stays literal). NOTE: today's live TeXeR + local
    // oracle disagree (they fit it to 150) — stored-ref-compatible until those
    // refs are refetched.
    if (_usedPictureComposite && pxPerUnit < 1.0) {
      pxPerUnit = pxPerUnitX = pxPerUnitY = 1.0;
    }
    // TRUE pass-2 (only when bounds are inexact): one corrective rescale of
    // the geometry so the frame (geometry + truesize) lands ON D.
    if (_boundsInexact && !_is3D && !_trueSizeFrame && !_usedPictureComposite) {
      const _spB = _spanAtScaleBp(pxPerUnitX, pxPerUnitY);
      const _gB = [];
      if (_spB.w > 1e-9) _gB.push(_Dfit / _spB.w);
      if (_spB.h > 1e-9) _gB.push(_Dfit / _spB.h);
      if (_gB.length) {
        const g = Math.min(..._gB);
        if (isFinite(g) && g > 0 && Math.abs(g - 1) > 0.002) {
          pxPerUnit *= g;
          pxPerUnitX = pxPerUnitY = pxPerUnit;
        }
      }
    }
    sizeW = scaleRefW2 * pxPerUnit;
    sizeH = scaleRefH2 * pxPerUnit;
`;

src = src.slice(0, ia) + NEW.replace(/\n/g, '\r\n') + src.slice(ib);
fs.writeFileSync(F, src);
console.error('spliced OK');
