'use strict';
const fs = require('fs');
const path = require('path');

const fixes = [
  { id: '10107', asy: 'c95_L3_script_5.asy',  note: 'Gridlines too dark/thick: pen + 0.4*bp was adding to default 0.5, giving 0.9pt. Fixed to replace (0.4pt).' },
  { id: '10104', asy: 'c95_L3_script_3.asy',  note: 'Same gridline linewidth fix (pen + linewidth arithmetic).' },
  { id: '10093', asy: 'c95_L3_script_2.asy',  note: 'Same gridline linewidth fix (pen + linewidth arithmetic).' },
  { id: '10198', asy: 'c95_L6_script_24.asy', note: 'Orange rectangle and red lines invisible: gridlines (from extend=true ticks) were drawn on top of user paths. Fixed draw order (gridlines now background layer). Also fixed gridline linewidth 0.9→0.4.' },
  { id: '04046', asy: 'c401_L13_p36170_problem_text_0.asy', note: 'Vertical axis label "Number of eggs" was off-screen: text-anchor="end" with rotate(-90°) sent text below SVG bottom. Fixed to text-anchor="middle" for all rotated labels.' },
  { id: '09673', asy: 'c583_L8_p50252_solution_text_0.asy', note: 'Whitespace between "$W-1$" and "cells": confirmed preserved in current rendering. Font updated to KaTeX_Main.' },
  { id: '05613', asy: 'c463_L12_script_6.asy', note: 'Fraction labels too small for cells: estH increased from 1.8× to 2.4× fontSize for \\frac content, improving vertical centering.' },
  { id: '01498', asy: 'c186_L17_p32637_problem_text_0.asy', note: '\\mathbf labels (Ai, Aj, etc.): KaTeX renders \\mathbf correctly with mathvariant="bold". UnFill white backgrounds present.' },
  { id: '01555', asy: 'c186_L18_p32212_solution_text_1.asy', note: 'Same \\mathbf fix context. Font updated to KaTeX_Main.' },
];

const ssimResults = JSON.parse(fs.readFileSync('comparison/ssim-results.json', 'utf8'));

function svgToDataURI(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const svg = fs.readFileSync(filePath, 'utf8');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function pngToDataURI(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath);
  return 'data:image/png;base64,' + data.toString('base64');
}

let rows = '';
for (const fix of fixes) {
  const { id, asy, note } = fix;
  const ssimEntry = ssimResults.find(r => r.id === id);
  const ssim = ssimEntry ? ssimEntry.ssim.toFixed(4) : 'N/A';

  const beforePath = `_htx_${id}.svg`;
  const afterPath = `comparison/htx_svgs/${id}.svg`;
  const texerPath = `comparison/texer_pngs/${id}.png`;
  const texerSrc = pngToDataURI(texerPath);

  // Use <object> for SVGs so browser MathML inside <foreignObject> renders correctly.
  // <img> sandboxes foreignObject content; <object> creates a proper browsing context.
  const svgStyle = 'max-width:280px;max-height:280px;border:1px solid #ccc;display:block;margin:auto;';
  const beforeImg = fs.existsSync(beforePath) ? `<object data="${beforePath}" type="image/svg+xml" style="${svgStyle}width:280px;height:280px;"></object>` : '<em>not found</em>';
  const afterImg = fs.existsSync(afterPath) ? `<object data="${afterPath}" type="image/svg+xml" style="${svgStyle}width:280px;height:280px;"></object>` : '<em>not found</em>';
  const texerImg = texerSrc ? `<img src="${texerSrc}" style="max-width:280px;max-height:280px;border:1px solid #ccc;">` : '<em>not found</em>';

  rows += `
  <tr>
    <td colspan="3" style="background:#f0f4f8;padding:8px 12px;font-weight:bold;font-size:14px;">
      ${id} &mdash; ${asy}
      <span style="font-weight:normal;color:#555;font-size:12px;"> &nbsp; SSIM after: ${ssim}</span>
    </td>
  </tr>
  <tr>
    <td style="padding:4px 8px;color:#888;font-size:12px;">Fix note:</td>
    <td colspan="2" style="padding:4px 8px;font-size:12px;color:#333;">${note}</td>
  </tr>
  <tr>
    <td style="padding:8px;text-align:center;vertical-align:top;">
      <div style="font-size:12px;color:#444;margin-bottom:4px;">Before (pre-fix HiTeXeR)</div>
      ${beforeImg}
    </td>
    <td style="padding:8px;text-align:center;vertical-align:top;">
      <div style="font-size:12px;color:#444;margin-bottom:4px;">After (fixed HiTeXeR)</div>
      ${afterImg}
    </td>
    <td style="padding:8px;text-align:center;vertical-align:top;">
      <div style="font-size:12px;color:#444;margin-bottom:4px;">TeXeR / Asymptote reference</div>
      ${texerImg}
    </td>
  </tr>
  <tr><td colspan="3" style="height:16px;"></td></tr>
`;
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>HiTeXeR Fix Comparison</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>
body { font-family: sans-serif; margin: 20px; background: #fff; }
h1 { font-size: 22px; }
table { border-collapse: collapse; width: 100%; }
td { border: 1px solid #ddd; }
img { display: block; margin: auto; }
</style>
</head>
<body>
<h1>HiTeXeR Fix Comparison</h1>
<p>Showing 9 diagrams that were fixed in this session. Each row shows: <strong>Before fix</strong>, <strong>After fix</strong>, <strong>TeXeR/Asymptote reference</strong>.</p>
<p>Fixes applied to <code>asy-interp.js</code>:
<ul>
  <li><strong>Pen linewidth</strong>: <code>pen + N*bp</code> was adding to default (0.5+0.4=0.9pt); now replaces (0.4pt)</li>
  <li><strong>Tick gridline draw order</strong>: <code>extend=true</code> gridlines now render in background layer, below user-drawn paths</li>
  <li><strong>Rotated labels</strong>: <code>text-anchor</code> changed to <code>middle</code> for rotated labels (fixes off-screen vertical axis labels)</li>
  <li><strong>Font family</strong>: Changed from <code>serif</code> to <code>KaTeX_Main, serif</code> for non-KaTeX text</li>
  <li><strong>Fraction height</strong>: <code>foreignObject</code> estH increased from 1.8&times; to 2.4&times; fontSize for <code>\\frac</code> content</li>
</ul>
</p>
<table>
${rows}
</table>
</body>
</html>`;

fs.writeFileSync('fix-comparison.html', html, 'utf8');
console.log('Written fix-comparison.html (' + Math.round(html.length/1024) + ' KB)');
