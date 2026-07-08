'use strict';
/**
 * htx-doc-render.js — node-side renderer for TeXeR "document" sources: a single
 * file holding MULTIPLE [asy]...[/asy] diagrams interleaved with text / LaTeX
 * spacing (\vspace) / bbcode, the way the AoPS TeXeR renders a whole post.
 *
 * The corpus pipeline historically wrapped the raw source as `[asy]\n…\n[/asy]`
 * and fed it to AsyInterp.render(), which strips the markers and runs EVERY
 * statement into ONE picture — so a 5-diagram document drew all five on top of
 * each other in the same coordinate system. This module instead renders each
 * [asy] block as its OWN image and stacks them vertically (matching index.html's
 * browser doc mode and TeXeR), honoring \vspace between blocks.
 *
 * Exports:
 *   isDocument(raw)      → true if the raw source has >1 [asy] block (an internal
 *                          [/asy] marker), i.e. needs document composition.
 *   renderDocSVG(raw, A, opts) → combined SVG string (A = AsyInterp instance).
 */

// A document if there's an internal [/asy] (the close of the implicit-or-explicit
// first block). A plain single diagram (raw Asymptote) has no such marker.
function isDocument(raw) {
  return /\[\/asy\]/i.test(raw);
}

// Normalize the TeXeR convention where the FIRST [asy] is implicit (the stored
// source begins in asy mode, first marker is a closing [/asy]) and the LAST block
// is left unclosed (the pipeline's wrapper appends the trailing [/asy]). Balance
// both ends so every block is a complete [asy]…[/asy] pair.
function normalize(raw) {
  let s = raw;
  const fOpen = s.search(/\[asy\]/i);
  const fClose = s.search(/\[\/asy\]/i);
  if (fClose >= 0 && (fOpen < 0 || fClose < fOpen)) s = '[asy]\n' + s;
  const opens = (s.match(/\[asy\]/gi) || []).length;
  const closes = (s.match(/\[\/asy\]/gi) || []).length;
  if (opens > closes) s = s + '\n[/asy]';
  return s;
}

function parseSegments(src) {
  const segs = [];
  const re = /\[asy\]([\s\S]*?)\[\/asy\]/gi;
  let last = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) segs.push({ t: 'text', v: src.slice(last, m.index) });
    segs.push({ t: 'asy', v: m[1] });
    last = m.index + m[0].length;
  }
  if (last < src.length) segs.push({ t: 'text', v: src.slice(last) });
  return segs;
}

// Pull width/height/viewBox and inner content out of a rendered block SVG.
function parseSvg(svg) {
  const open = svg.match(/<svg\b[^>]*>/i);
  if (!open) return null;
  const tag = open[0];
  const w = parseFloat((tag.match(/\bwidth="([\d.]+)"/) || [])[1] || '0');
  const h = parseFloat((tag.match(/\bheight="([\d.]+)"/) || [])[1] || '0');
  const vb = (tag.match(/viewBox="([^"]+)"/) || [])[1] || `0 0 ${w} ${h}`;
  const inner = svg.slice(open.index + tag.length, svg.lastIndexOf('</svg>'));
  return { w, h, vb, inner };
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Render the whole document to one composed SVG. `A` is the AsyInterp instance
// (window.AsyInterp). `opts` is passed through to each block's render().
function renderDocSVG(raw, A, opts) {
  opts = opts || {};
  const src = normalize(raw);
  const segs = parseSegments(src);

  // R = px per bp (the renderer's intrinsic→display scale). Derived from the
  // first diagram block; used to size \vspace and text in display px.
  let R = 5 / 3; // default ≈1.6667 (matches the renderer)
  const blocks = [];   // rendered diagram rows
  let gotScale = false;

  // First pass: render diagrams, learn R.
  const rows = [];     // ordered: {kind:'diagram',idx} | {kind:'vspace',px} | {kind:'text',lines}
  let diagN = 0;
  for (const s of segs) {
    if (s.t === 'asy') {
      let parsed = null;
      try {
        const r = A.render('[asy]\n' + s.v + '\n[/asy]', opts);
        parsed = parseSvg(r.svg);
      } catch (e) { parsed = null; }
      if (parsed) {
        if (!gotScale && parsed.w > 0) {
          const vbW = parseFloat(parsed.vb.split(/\s+/)[2]) || parsed.w;
          if (vbW > 0) { R = parsed.w / vbW; gotScale = true; }
        }
        const idx = blocks.push(parsed) - 1;
        rows.push({ kind: 'diagram', idx });
      } else {
        rows.push({ kind: 'text', lines: ['[diagram failed to render]'] });
      }
      diagN++;
    } else {
      pushTextRows(rows, s.v, R);
    }
  }

  // Unit → px (display) conversions, all relative to R (px per bp).
  const BP_PER_CM = 28.346457, BP_PER_PT = 72 / 72.27;
  function unitPx(val, unit) {
    switch ((unit || 'cm').toLowerCase()) {
      case 'cm': return val * BP_PER_CM * R;
      case 'mm': return val * (BP_PER_CM / 10) * R;
      case 'in': return val * 72 * R;
      case 'pt': return val * BP_PER_PT * R;
      case 'bp': return val * R;
      case 'em': return val * 10 * BP_PER_PT * R; // ≈10pt
      case 'ex': return val * 4.3 * BP_PER_PT * R;
      default:   return val * BP_PER_CM * R;
    }
  }
  // Resolve vspace rows now that R is known.
  for (const row of rows) if (row.kind === 'vspace') row.px = unitPx(row.val, row.unit);

  // Layout: stack top→bottom. Diagrams centered horizontally. A small default
  // gap separates consecutive paragraphs/blocks; \vspace adds (signed) to it.
  const TEXT_FS = 11 * BP_PER_PT * R;          // ~11pt text
  const LINE_H = TEXT_FS * 1.3;
  // TeXeR stacks consecutive display [asy] images with a sizeable paragraph gap
  // (~2cm, calibrated against the 12984 standing-wave reference); \vspace adds
  // (signed) on top of it. Without this the negative \vspace overlaps the blocks.
  const DEFAULT_GAP = Math.round(2.0 * BP_PER_CM * R);

  let totalW = 1;
  for (const row of rows) {
    if (row.kind === 'diagram') totalW = Math.max(totalW, blocks[row.idx].w);
    else if (row.kind === 'text') for (const ln of row.lines) totalW = Math.max(totalW, ln.length * TEXT_FS * 0.55);
  }
  totalW = Math.ceil(totalW);

  const parts = [];
  let y = 0;
  let prevWasContent = false;
  for (const row of rows) {
    if (row.kind === 'vspace') { y += row.px; continue; }
    if (prevWasContent) y += DEFAULT_GAP;       // paragraph gap between content rows
    if (row.kind === 'diagram') {
      const b = blocks[row.idx];
      const x = Math.round((totalW - b.w) / 2);
      parts.push(`<svg x="${x}" y="${Math.round(y)}" width="${b.w}" height="${b.h}" viewBox="${b.vb}" overflow="visible">${b.inner}</svg>`);
      y += b.h;
      prevWasContent = true;
    } else { // text
      for (const ln of row.lines) {
        y += TEXT_FS;
        parts.push(`<text x="0" y="${Math.round(y)}" font-family="serif" font-size="${TEXT_FS.toFixed(2)}" fill="#000">${escXml(ln)}</text>`);
        y += LINE_H - TEXT_FS;
      }
      prevWasContent = true;
    }
  }

  const totalH = Math.max(1, Math.ceil(y));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" overflow="visible" data-intrinsic-w="${totalW}" data-intrinsic-h="${totalH}">\n${parts.join('\n')}\n</svg>`;
}

// Turn a between-blocks text segment into layout rows: \vspace → spacing rows;
// other non-empty, non-pure-comment lines → plain text rows (best-effort; the
// corpus's inter-block text is overwhelmingly \vspace and stray comments).
function pushTextRows(rows, text, R) {
  const lines = text.split(/\r?\n/);
  let textLines = [];
  const flush = () => { if (textLines.length) { rows.push({ kind: 'text', lines: textLines }); textLines = []; } };
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const vm = line.match(/^\\vspace\*?\{\s*(-?[\d.]+)\s*(cm|mm|pt|bp|in|em|ex)\s*\}\s*$/i);
    if (vm) { flush(); rows.push({ kind: 'vspace', val: parseFloat(vm[1]), unit: vm[2] }); continue; }
    // Drop standalone Asymptote comment lines that leaked outside [asy] blocks
    // (e.g. "//Mirror") — TeXeR shows them literally, but they're visual noise;
    // keep them so the stack height stays faithful, but stripped of the // .
    let disp = line.replace(/^\/\/\s?/, '');
    // Strip simple inline bbcode/markup we don't lay out here.
    disp = disp.replace(/\[\/?[a-z][^\]]*\]/gi, '').replace(/\$([^$]*)\$/g, '$1').trim();
    if (disp) textLines.push(disp);
  }
  flush();
}

// Universal export: node (pipeline/_render_one), browser window (blink.html
// live pane), and Web Workers (htx-worker.js pool) all load THIS file, so the
// multi-[asy] document composition has a single source of truth — an engine
// or doc-mode change propagates to every surface by construction.
const _HTXDocExports = { isDocument, renderDocSVG, parseSegments, normalize };
if (typeof module !== 'undefined' && module.exports) module.exports = _HTXDocExports;
if (typeof self !== 'undefined') self.HTXDocRender = _HTXDocExports;
else if (typeof window !== 'undefined') window.HTXDocRender = _HTXDocExports;
