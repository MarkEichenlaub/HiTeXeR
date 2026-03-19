'use strict';
const fs = require('fs');

for (const id of ['05616','05632','05666']) {
  const svg = fs.readFileSync('comparison/htx_svgs/' + id + '.svg', 'utf8');
  const textCount = (svg.match(/<text/g) || []).length;
  const foreignCount = (svg.match(/<foreignObject/g) || []).length;
  const pathCount = (svg.match(/<path/g) || []).length;

  // Extract text element contents
  const texts = [];
  const re = /<text[^>]+>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg)) !== null) texts.push(m[1]);

  // Get SVG dimensions
  const wm = svg.match(/width="([^"]+)"/);
  const hm = svg.match(/height="([^"]+)"/);
  const vbm = svg.match(/viewBox="([^"]+)"/);

  console.log('=== ' + id + ' ===');
  console.log('  size: ' + (wm?wm[1]:'?') + 'x' + (hm?hm[1]:'?') + '  viewBox=' + (vbm?vbm[1]:'?'));
  console.log('  elements: text=' + textCount + ' foreignObject=' + foreignCount + ' path=' + pathCount);
  console.log('  text content: [' + texts.slice(0, 20).join('|') + (texts.length > 20 ? '|...' : '') + ']');
  console.log('');
}
