const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
require('./asy-interp.js');

// Wrap evalDraw to log incoming args
const asyInterp = window.AsyInterp;

const src = `
draw((0,0)--(0,1), dashed, arrow=Arrow(6));
`;

// Hack: monkey-patch by adding debug inside asy-interp
// Just render and print SVG
let r = window.AsyInterp.render(src, { format: 'svg' });
if (typeof r === 'object' && r.svg) r = r.svg;
console.log('=== SVG ===');
console.log(r);
