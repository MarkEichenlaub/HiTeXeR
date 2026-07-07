'use strict';
// katex-svg.js — KaTeX SVG emitter.
//
// Walks the DomTree produced by katex.__renderToDomTree (the exact layout
// KaTeX would realize with HTML+CSS) and emits self-contained SVG markup:
// real <path> glyph outlines (from katex-glyphs.json, built by
// build-katex-glyphs.js) instead of a <foreignObject> HTML island. This makes
// browser-rendered labels rasterizable by any SVG consumer, portable without
// katex.min.css, and exactly measurable.
//
// Layout model (reverse-engineered from KaTeX 0.16.x buildCommon/katex.css —
// pinned version; re-verify on upgrade):
//  - Inline flow: children advance x by width (SymbolNode.width em) plus
//    style.marginLeft/marginRight; span style.width overrides content width
//    (mspace); style.paddingLeft shifts content (sqrt svg-align).
//  - vlist (class vlist-t > vlist-r > vlist): each row wrapper has
//    style.top = -pstrut - shift - contentDepth, so the row content baseline
//    sits at shiftUp = -(top + pstrut) - contentDepth above the outer
//    baseline. Verified: \frac numerator 0.394em (TeX num2), denominator
//    -0.345em (denom2), rule bottom at 0.23em -> center on the 0.25em axis.
//  - Rules: span with style.borderBottomWidth paints a rect of that height
//    whose BOTTOM edge is at the row baseline, full column width.
//  - hide-tail (sqrt surd): nested <svg> of fixed height, width clipped to
//    the column width, preserveAspectRatio="xMinYMin slice" (KaTeX's own
//    geometry); we reuse the SvgNode's markup with patched dimensions.
//  - sizing/fontsize-ensurer classes (reset-sizeJ sizeI): multiply the local
//    scale by mult[I]/mult[J].
//  - llap/rlap/clap: zero-advance overlap boxes.
//
// API:
//   katexSvg.init(glyphData)              — install katex-glyphs.json content
//   katexSvg.ready()                      — glyphs + katex both available
//   katexSvg.render(tex, {emPx, color})   — {svg, widthEm, heightEm, depthEm}
//                                            svg: markup with baseline at
//                                            (0,0), x growing right, y down.
//   katexSvg.measure(tex)                 — {widthEm, heightEm, depthEm}
(function (root) {
  const katexSvg = {};
  let GLYPHS = null;
  let UPEM = 1000;

  katexSvg.init = function (data) {
    if (data && data.faces) { GLYPHS = data.faces; UPEM = data.upem || 1000; }
  };
  katexSvg.ready = function () {
    return !!GLYPHS && (typeof katex !== 'undefined' || typeof require === 'function');
  };

  function getKatex() {
    if (typeof katex !== 'undefined') return katex;
    try { return require('katex'); } catch (e) { return null; }
  }

  // KaTeX size multipliers (src/Options.js sizeMultipliers, 1-indexed)
  const SIZE_MULT = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.44, 1.728, 2.074, 2.488];

  // class -> font face. Order matters only via the priority list below.
  const FACE_BY_CLASS = {
    mathnormal: 'KaTeX_Math-Italic',
    mathdefault: 'KaTeX_Math-Italic',
    boldsymbol: 'KaTeX_Math-BoldItalic',
    mathit: 'KaTeX_Main-Italic',
    textit: 'KaTeX_Main-Italic',
    mathrm: 'KaTeX_Main-Regular',
    textrm: 'KaTeX_Main-Regular',
    mainrm: 'KaTeX_Main-Regular',
    mathbf: 'KaTeX_Main-Bold',
    textbf: 'KaTeX_Main-Bold',
    mathsf: 'KaTeX_SansSerif-Regular',
    textsf: 'KaTeX_SansSerif-Regular',
    mathtt: 'KaTeX_Typewriter-Regular',
    texttt: 'KaTeX_Typewriter-Regular',
    mathcal: 'KaTeX_Caligraphic-Regular',
    mathfrak: 'KaTeX_Fraktur-Regular',
    mathscr: 'KaTeX_Script-Regular',
    amsrm: 'KaTeX_AMS-Regular',
    'delim-size1': 'KaTeX_Size1-Regular',
    'delim-size4': 'KaTeX_Size4-Regular',
  };

  function faceForClasses(classes, inherited) {
    if (!classes) return inherited;
    let face = null;
    let bold = false, italic = false, sans = false;
    for (const c of classes) {
      if (c === 'textbf') bold = true;
      else if (c === 'textit') italic = true;
      else if (c === 'textsf' || c === 'mathsf') sans = true;
      if (FACE_BY_CLASS[c]) face = FACE_BY_CLASS[c];
    }
    // delimiter sizing spans: 'delimsizing size1..4'
    if (classes.indexOf('delimsizing') !== -1) {
      for (const c of classes) {
        const m = /^size([1-4])$/.exec(c);
        if (m) face = 'KaTeX_Size' + m[1] + '-Regular';
      }
      if (classes.indexOf('mult') !== -1) face = null; // assembled: inner delim-size classes decide
    }
    // large operators: 'mop op-symbol small-op|large-op'
    if (classes.indexOf('op-symbol') !== -1) {
      face = classes.indexOf('large-op') !== -1 ? 'KaTeX_Size2-Regular' : 'KaTeX_Size1-Regular';
    }
    // combined text-mode styles
    if (sans) face = bold ? 'KaTeX_SansSerif-Bold' : (italic ? 'KaTeX_SansSerif-Italic' : 'KaTeX_SansSerif-Regular');
    else if (bold && italic) face = 'KaTeX_Main-BoldItalic';
    else if (bold) face = 'KaTeX_Main-Bold';
    else if (italic && !face) face = 'KaTeX_Main-Italic';
    if (classes.indexOf('mathcal') !== -1 && bold) face = 'KaTeX_Caligraphic-Bold';
    if (classes.indexOf('mathfrak') !== -1 && bold) face = 'KaTeX_Fraktur-Bold';
    return face || inherited;
  }

  function scaleForClasses(classes) {
    if (!classes) return 1;
    let i = null, j = null;
    let sizing = false;
    for (const c of classes) {
      if (c === 'sizing' || c === 'fontsize-ensurer') sizing = true;
      let m;
      if ((m = /^size(\d+)$/.exec(c)) && classes.indexOf('delimsizing') === -1) i = +m[1];
      else if ((m = /^reset-size(\d+)$/.exec(c))) j = +m[1];
    }
    if (sizing && i != null && j != null && SIZE_MULT[i] && SIZE_MULT[j]) return SIZE_MULT[i] / SIZE_MULT[j];
    return 1;
  }

  const em = (s) => {
    if (s == null) return 0;
    const m = /^(-?[\d.]+)em$/.exec(String(s));
    return m ? parseFloat(m[1]) : 0;
  };
  const has = (n, cls) => n.classes && n.classes.indexOf(cls) !== -1;
  const isSym = (n) => n.text !== undefined && n.children === undefined;
  const isSvgNode = (n) => n.attributes !== undefined && n.children !== undefined && n.attributes.viewBox !== undefined;

  // ---- measurement (returns width in em at the node's LOCAL scale=1) ------
  const _wCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function widthOf(n) {
    if (n == null) return 0;
    if (_wCache && _wCache.has(n)) return _wCache.get(n);
    let w = widthOfInner(n);
    if (_wCache) _wCache.set(n, w);
    return w;
  }
  // Widths that KaTeX assigns via CSS CLASS rules (katex.css), not inline style.
  const CLASS_WIDTH = { nulldelimiter: 0.12 };
  // Horizontal padding KaTeX adds via CSS CLASS (katex.css), not inline style.
  // .boxpad{padding:0 0.3em} is the \fboxsep gap inside \fbox/\colorbox/\fcolorbox
  // — without it the framed box would hug the glyphs with no breathing room.
  const CLASS_HPAD = { boxpad: 0.3 };          // em PER SIDE
  function classHPadEm(classes) {
    let p = 0;
    for (const c of (classes || [])) if (CLASS_HPAD[c] !== undefined) p += CLASS_HPAD[c];
    return p; // per side
  }
  // Advance width of a SymbolNode in em. KaTeX merges adjacent text-mode
  // symbols into one node (tryCombineChars) but the merged .width only
  // reflects the first character (" cells" reported 0.25em), so multi-char
  // runs sum the font advances instead; single chars trust KaTeX's metric.
  function symAdvanceEm(n, face) {
    const text = n.text || '';
    const chars = Array.from(text);
    if (chars.length <= 1) return typeof n.width === 'number' ? n.width : 0;
    const table = (GLYPHS && (GLYPHS[face] || GLYPHS['KaTeX_Main-Regular'])) || {};
    let w = 0;
    for (const ch of chars) {
      const g = table[ch] || (GLYPHS && GLYPHS['KaTeX_Main-Regular'] || {})[ch];
      w += g ? g.a / UPEM : 0.5;
    }
    return w;
  }
  function widthOfInner(n) {
    if (isSym(n)) {
      let w = symAdvanceEm(n, faceForClasses(n.classes, 'KaTeX_Main-Regular'));
      // padding shifts/advances inline content too (sqrt radicand carries
      // paddingLeft = surd advanceWidth so the vlist column — and the surd
      // overline stretched to it — clears the radicand).
      if (n.style) w += em(n.style.marginLeft) + em(n.style.marginRight)
                      + em(n.style.paddingLeft) + em(n.style.paddingRight);
      return w;
    }
    if (isSvgNode(n)) {
      // Stretchy svgs (sqrt tails, wide accents) are width:100% overlays
      // clipped by their hide-tail container — they must NOT drive layout
      // width (the raw attr is a 400em repeating-tail canvas).
      const wa = n.attributes.width;
      const wEm = wa && /em$/.test(wa) ? parseFloat(wa) : 0;
      return wEm >= 100 ? 0 : wEm;
    }
    if (n.pathName !== undefined) return 0;
    const style = n.style || {};
    for (const c of (n.classes || [])) {
      if (CLASS_WIDTH[c] !== undefined) return CLASS_WIDTH[c];
    }
    // hide-tail containers are width:100% of the vlist column; zero intrinsic.
    if (has(n, 'hide-tail')) return 0;
    let w;
    if (style.width !== undefined) {
      w = em(style.width);
    } else if (has(n, 'vlist-t')) {
      // column width = max row content width (first vlist-r)
      w = 0;
      const rows = vlistRows(n);
      for (const r of rows) w = Math.max(w, r.contentW);
    } else if (has(n, 'llap') || has(n, 'rlap') || has(n, 'clap')) {
      w = 0;
    } else {
      w = 0;
      const sc = scaleForClasses(n.classes);
      for (const c of (n.children || [])) w += widthOf(c) * sc;
    }
    w += em(style.marginLeft) + em(style.marginRight) + em(style.paddingLeft) + em(style.paddingRight)
       + 2 * classHPadEm(n.classes);
    return w;
  }

  // Decompose a vlist-t node into rows: {topEm, content, contentW, contentDepth, pstrut}
  function vlistRows(vt) {
    const out = [];
    const firstR = (vt.children || []).find((c) => has(c, 'vlist-r'));
    if (!firstR) return out;
    const vl = (firstR.children || []).find((c) => has(c, 'vlist'));
    if (!vl) return out;
    for (const row of (vl.children || [])) {
      if (!row.children) continue;
      let pstrut = 0, content = null;
      for (const k of row.children) {
        if (has(k, 'pstrut')) pstrut = em(k.style && k.style.height);
        else content = k;
      }
      if (!content) continue;
      const sc = scaleForClasses(row.classes) /* rows are plain spans */;
      out.push({
        topEm: em(row.style && row.style.top),
        pstrut,
        content,
        contentW: widthOf(content) * sc,
        contentDepth: typeof content.depth === 'number' ? content.depth : 0,
        rowScale: sc,
      });
    }
    return out;
  }

  // ---- emission ------------------------------------------------------------
  // ctx: { x, y (baseline, px), s (px per em at current level), color, out[] }
  function fmt(n) { return Math.abs(n) < 1e-7 ? '0' : (Math.round(n * 1000) / 1000).toString(); }

  function emitSym(n, ctx) {
    const face = faceForClasses(n.classes, ctx.face);
    const style = n.style || {};
    let x = ctx.x + (em(style.marginLeft) + em(style.paddingLeft)) * ctx.s;
    const color = style.color || ctx.color;
    const text = n.text || '';
    const table = GLYPHS[face] || GLYPHS['KaTeX_Main-Regular'] || {};
    let consumedW = 0;
    for (const ch of text) {
      const g = table[ch] || (GLYPHS['KaTeX_Main-Regular'] || {})[ch];
      if (g && g.p) {
        const k = ctx.s / UPEM;
        ctx.out.push('<path transform="translate(' + fmt(x) + ',' + fmt(ctx.y) + ') scale(' + fmt(k) + ',' + fmt(-k) + ')" d="' + g.p + '" fill="' + color + '"/>');
        consumedW += (g.a / UPEM);
        x += (g.a / UPEM) * ctx.s;
      } else if (g) {
        // glyph with an advance but no outline (space): advance only
        consumedW += (g.a / UPEM);
        x += (g.a / UPEM) * ctx.s;
      } else if (ch && ch !== '​') {
        // glyph missing from table: SVG <text> fallback in the matching face
        ctx.out.push('<text x="' + fmt(x) + '" y="' + fmt(ctx.y) + '" font-size="' + fmt(ctx.s) + '" font-family="' + face.replace(/-(Regular|Bold|Italic|BoldItalic)$/, '') + '" fill="' + color + '">' + ch.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>');
        const wGuess = Array.from(text).length === 1 && typeof n.width === 'number' ? n.width : 0.5;
        x += wGuess * ctx.s; consumedW += wGuess;
      }
    }
    // Advance: KaTeX's metric width for single glyphs (authoritative);
    // glyph-advance sum for merged multi-char text runs (see symAdvanceEm).
    const w = symAdvanceEm(n, face) || consumedW;
    return (em(style.marginLeft) + em(style.paddingLeft) + w
            + em(style.marginRight) + em(style.paddingRight)) * ctx.s;
  }

  function emitSvgNode(n, ctx, colWpx, baseYpx) {
    // Reproduce KaTeX's stretchy svg: height from attrs, width clipped to column.
    const hEm = n.attributes.height ? parseFloat(n.attributes.height) : 1;
    const hPx = hEm * ctx.s;
    const topPx = baseYpx - hPx; // inline-block svg bottom sits on the baseline
    const k = getKatex();
    let inner = '';
    try { inner = n.toMarkup(); } catch (e) { inner = ''; }
    // pull out the path(s)
    const body = inner.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const vb = n.attributes.viewBox || '0 0 400000 ' + Math.round(hEm * 1000);
    const par = n.attributes.preserveAspectRatio || 'xMinYMin slice';
    ctx.out.push('<svg x="' + fmt(ctx.x) + '" y="' + fmt(topPx) + '" width="' + fmt(colWpx) + '" height="' + fmt(hPx) + '" viewBox="' + vb + '" preserveAspectRatio="' + par + '" fill="' + (ctx.color) + '">' + body + '</svg>');
    return colWpx;
  }

  function emitNode(n, ctx) {
    // returns advance in px
    if (n == null) return 0;
    if (isSym(n)) return emitSym(n, ctx);
    if (n.pathName !== undefined) return 0;
    if (isSvgNode(n)) {
      // bare svg outside hide-tail (stretchy arrows etc.): width attr em
      const wEm = n.attributes.width && /em$/.test(n.attributes.width) ? parseFloat(n.attributes.width) : 1;
      return emitSvgNode(n, ctx, wEm * ctx.s, ctx.y);
    }
    const classes = n.classes || [];
    const style = n.style || {};
    if (classes.indexOf('strut') !== -1 || classes.indexOf('pstrut') !== -1 || classes.indexOf('vlist-s') !== -1) return 0;

    const sc = scaleForClasses(classes);
    const face = faceForClasses(classes, ctx.face);
    const color = style.color || ctx.color;
    const marginL = em(style.marginLeft) * ctx.s;
    const marginR = em(style.marginRight) * ctx.s;
    const classHPad = classHPadEm(classes) * ctx.s * sc;   // .boxpad \fboxsep
    const padL = em(style.paddingLeft) * ctx.s * sc + classHPad;

    if (has(n, 'vlist-t')) {
      const rows = vlistRows(n);
      let colW = 0;
      for (const r of rows) colW = Math.max(colW, r.contentW * ctx.s);
      // op-limits / accent / centered matrix columns center each row within the
      // column (katex.css: ".op-limits > .vlist-t{text-align:center}"); plain
      // vlists (fractions, sub/sup stacks) left-align.
      const center = !!ctx.centerCols;
      for (const r of rows) {
        // KaTeX places each vlist row so its content BASELINE sits at
        // (top + pstrutHeight) below the vlist top reference (= ctx.y here);
        // this is independent of the content's own depth. The earlier
        // `- r.contentDepth` term was a latent bug — harmless for every common
        // vlist (fraction num/den, sup/sub, sqrt radicand all report row-content
        // depth 0) but it pushed any depth-bearing row DOWN by its own depth.
        // That mis-placed the nested munder inside \underbrace{...}_{n}: the
        // brace (depth ~0.65em) dropped a full 0.65em, opening a big gap under
        // the braced content and crashing the brace into the subscript label
        // (04943-04947). Use the exact KaTeX baseline.
        const shiftUpEm = -(r.topEm + r.pstrut);
        const rowBaseY = ctx.y - shiftUpEm * ctx.s;
        const content = r.content;
        const cstyle = content.style || {};
        // A stretchy/svg-align/hide-tail row fills the column width (its measured
        // contentW is 0 — the inner svg is a 400em repeating-tail canvas), so it
        // must stay at the column origin even when the vlist centers. Otherwise a
        // \underbrace's brace got "centered" as a zero-width item and slid to the
        // right half of its box (04947).
        const fillsCol = has(content, 'svg-align') || has(content, 'stretchy') || has(content, 'hide-tail');
        const cx = ctx.x + marginL + ((center && !fillsCol) ? (colW - r.contentW * ctx.s) / 2 : 0);
        if (cstyle.borderBottomWidth !== undefined && em(cstyle.borderBottomWidth) > 0) {
          // rule: full column width, bottom edge at row baseline
          const t = em(cstyle.borderBottomWidth) * ctx.s;
          ctx.out.push('<rect x="' + fmt(ctx.x + marginL) + '" y="' + fmt(rowBaseY - t) + '" width="' + fmt(colW) + '" height="' + fmt(t) + '" fill="' + color + '"/>');
          continue;
        }
        // \fbox / \fcolorbox frame: KaTeX (enclose.ts) emits a `stretchy fbox`
        // (or fcolorbox) span carrying borderStyle:solid + borderWidth, stretched
        // to the full column width. Paint a 4-sided stroked rectangle. The span's
        // style.height is the box's TOTAL height and its baseline (rowBaseY) sits
        // at the box BOTTOM (depth 0); box-sizing:border-box ⇒ the border paints
        // INSIDE the column box. Without this the digit rendered but the frame
        // around it vanished (05938 binary-tree boxes, and every \fbox label).
        if ((has(content, 'fbox') || has(content, 'fcolorbox')
             || cstyle.borderStyle === 'solid') && has(content, 'stretchy')) {
          const boxH = (em(cstyle.height)
                        || (typeof content.height === 'number' ? content.height : 0)) * ctx.s;
          const bw = (cstyle.borderWidth !== undefined ? em(cstyle.borderWidth) : 0.04) * ctx.s;
          const bcolor = cstyle.borderColor || color;
          const bx = ctx.x + marginL, byTop = rowBaseY - boxH;
          if (boxH > 0 && colW > 0 && bw > 0) {
            const R = (x0, y0, w0, h0) => ctx.out.push('<rect x="' + fmt(x0) + '" y="' + fmt(y0)
              + '" width="' + fmt(w0) + '" height="' + fmt(h0) + '" fill="' + bcolor + '"/>');
            R(bx, byTop, colW, bw);                 // top
            R(bx, rowBaseY - bw, colW, bw);         // bottom
            R(bx, byTop, bw, boxH);                 // left
            R(bx + colW - bw, byTop, bw, boxH);     // right
          }
          continue;
        }
        if (has(content, 'hide-tail')) {
          const svgKid = (content.children || []).find(isSvgNode);
          if (svgKid) emitSvgNode(svgKid, { ...ctx, x: cx, color }, colW, rowBaseY);
          continue;
        }
        emitNode(content, { ...ctx, x: cx, y: rowBaseY, s: ctx.s, face, color, colW, centerCols: false });
      }
      return marginL + colW + marginR;
    }

    // Stretchy horizontal extensible (\overbrace/\underbrace, \xrightarrow, ...):
    // KaTeX lays the parts out absolutely as CSS fractions of the column width
    // (the .stretchy span is width:100%); each child svg's width="400em" is a
    // 400000-unit slice canvas, NOT its rendered width. Render each part clipped
    // to its CSS fraction of the column (ctx.colW), preserving the per-part
    // preserveAspectRatio (xMin/xMid/xMax slice) so the slices tile into a brace.
    if (has(n, 'stretchy') && ctx.colW) {
      const W = Math.max(ctx.colW, em(style.minWidth) * ctx.s);
      const x0 = ctx.x + marginL;
      for (const part of (n.children || [])) {
        const svgKid = isSvgNode(part) ? part : (part.children || []).find(isSvgNode);
        if (!svgKid) continue;
        let frac = 1, off = 0;
        if (has(part, 'brace-left')) { frac = 0.251; off = 0; }
        else if (has(part, 'brace-center')) { frac = 0.5; off = 0.25; }
        else if (has(part, 'brace-right')) { frac = 0.251; off = 0.749; }
        else if (has(part, 'halfarrow-left')) { frac = 0.502; off = 0; }
        else if (has(part, 'halfarrow-right')) { frac = 0.502; off = 0.498; }
        emitSvgNode(svgKid, { ...ctx, x: x0 + off * W, color }, frac * W, ctx.y);
      }
      return marginL + W + marginR;
    }

    if (has(n, 'llap') || has(n, 'rlap') || has(n, 'clap')) {
      // overlap boxes: KaTeX wraps content in an inner span; measure content
      let innerW = 0;
      for (const c of (n.children || [])) innerW += widthOf(c) * ctx.s * sc;
      let startX = ctx.x;
      if (has(n, 'llap')) startX = ctx.x - innerW;
      else if (has(n, 'clap')) startX = ctx.x - innerW / 2;
      let xx = startX;
      for (const c of (n.children || [])) {
        xx += emitNode(c, { ...ctx, x: xx, s: ctx.s * sc, face, color });
      }
      return 0;
    }

    // generic inline span. op-limits / accent / centered matrix columns center
    // their immediate child vlist-t (see katex.css ".op-limits > .vlist-t").
    // Fractions also center numerator/denominator within the column
    // (katex.css ".mfrac>span>span{text-align:center}") — without this a
    // narrow denominator like "2" under "1-\mu" hugs the left edge (06517).
    // munder/mover: horizontal-brace and under/overset stacks center the
    // script over the (full-column-width) base — e.g. \underbrace{...}_{2}
    // centers "2" under the brace; without this it hugs the left edge (04947).
    const childCenter = has(n, 'op-limits') || has(n, 'accent') || has(n, 'col-align-c') || has(n, 'mfrac')
      || has(n, 'munder') || has(n, 'mover');
    let x = ctx.x + marginL + padL;
    const kids = n.children || [];
    for (let ki = 0; ki < kids.length; ki++) {
      const c = kids[ki];
      x += emitNode(c, { ...ctx, x, s: ctx.s * sc, face, color, centerCols: childCenter });
      // TeX math-mode italic correction: an italic-font letter's box in TeX is
      // charwd + charic — the correction is a kern added after the atom, both
      // mid-string ($Mx$: x starts after M's ic) and trailing ($M$ E/W-aligned:
      // the box edge clears the overhang). KaTeX stores .italic on the
      // SymbolNode but (for mathnormal) neither advances by it nor sets a
      // marginRight, so every italic capital measured/rendered ~0.05-0.22em
      // narrower than TeX's box (oracle probe: W-aligned $M$ sat 1.1bp too
      // close to its anchor; N/S-centered shifted half that). Advance by the
      // metric here, matching TeX. Skip when KaTeX already carries the ic in
      // marginRight (\mathit path), and skip before an msupsub sibling: TeX
      // attaches subscripts at the width WITHOUT the correction, which KaTeX
      // models inside the msupsub vlist itself.
      if (isSym(c) && c.italic > 0 && !(c.style && c.style.marginRight)) {
        const nxt = kids[ki + 1];
        if (!(nxt && nxt.classes && nxt.classes.indexOf('msupsub') !== -1)) {
          x += c.italic * ctx.s * sc;
        }
      }
    }
    let advance = (x - ctx.x) + marginR + classHPad;   // symmetric .boxpad right pad
    if (style.width !== undefined) {
      advance = em(style.width) * ctx.s + marginL + marginR;
    }
    for (const c of classes) {
      if (CLASS_WIDTH[c] !== undefined) advance = CLASS_WIDTH[c] * ctx.s + marginL + marginR;
    }
    return advance;
  }

  // ---- public API ----------------------------------------------------------
  // User \def/\newcommand macros from Asymptote's texpreamble(), applied to every
  // label render/measure. Set via katexSvg.setMacros (below); null = none.
  let _activeMacros = null;
  katexSvg.render = function (tex, opts) {
    opts = opts || {};
    const k = getKatex();
    if (!k || !GLYPHS) return null;
    let tree;
    try {
      const _ktopts = { throwOnError: false, displayMode: false, output: 'html' };
      if (_activeMacros) _ktopts.macros = _activeMacros;
      tree = k.__renderToDomTree(tex, _ktopts);
    } catch (e) { return null; }
    if (!tree || !tree.children) return null;
    // error fallback: KaTeX returns a span.katex-error / color #cc0000 title node
    if (tree.attributes && tree.attributes.title) return null;
    if (tree.classes && tree.classes.indexOf('katex-error') !== -1) return null;
    const emPx = opts.emPx || 16;
    const ctx = { x: 0, y: 0, s: emPx, face: 'KaTeX_Main-Regular', color: opts.color || '#000000', out: [] };
    let w;
    try { w = emitNode(tree, ctx); } catch (e) { return null; }
    return {
      svg: ctx.out.join(''),
      widthEm: w / emPx,
      heightEm: typeof tree.height === 'number' ? tree.height : 0.7,
      depthEm: typeof tree.depth === 'number' ? tree.depth : 0.2,
    };
  };

  // Single width authority: the measured box is derived from the SAME emission
  // pass that DRAWS the label (render → emitNode), not a parallel walker.
  // emitNode is what produces the on-screen geometry, so a measure built on it
  // can never drift from the render — this closes the measure≠render gap (the
  // hazard this whole engine exists to kill) one level down, inside the emitter.
  // Verified a NO-OP at adoption: render().widthEm equals the prior widthOf(tree)
  // to <1e-4 em on every one of 48 synthetic + 1688 real corpus labels tested, so
  // it shifts no placement/bbox/fit result — it only removes the drift risk going
  // forward. widthOf survives ONLY as an internal helper for emitNode's
  // sub-measurements (vlist column widths, llap/clap, stretchy parts); it is no
  // longer the top-level measurement authority.
  // Cached by source string (measure is pure) so the fit/placement loops that
  // call it repeatedly don't re-run the emit — strictly faster than the old path,
  // which rebuilt the DomTree on every call.
  const _measureCache = new Map();
  // Install user macros (from texpreamble). Clearing the measure cache is required
  // because cached widths were computed without the macros (or with stale ones).
  katexSvg.setMacros = function (m) {
    const next = (m && typeof m === 'object' && Object.keys(m).length) ? m : null;
    if (next === null && _activeMacros === null) return; // already empty — keep cache
    _activeMacros = next;
    _measureCache.clear();
  };
  katexSvg.measure = function (tex) {
    if (_measureCache.has(tex)) return _measureCache.get(tex);
    const r = katexSvg.render(tex, { emPx: 16 });
    const out = r ? { widthEm: r.widthEm, heightEm: r.heightEm, depthEm: r.depthEm } : null;
    _measureCache.set(tex, out);
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = katexSvg;
  if (root) root.katexSvg = katexSvg;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
