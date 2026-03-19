'use strict';
global.window = {};
require('./asy-interp.js');
const A = window.AsyInterp;

const code = `[asy]
size(150);
import three;
currentprojection = orthographic(1, -2, 0.5);
triple A, B, C, D;
A = (0,0,1); B = (1,0,0); C = (0,1,0); D = (0,0,-1);
draw(A--B--C--cycle);
draw(A--D, dashed);
dot(A);
label("A",A,N);
[/asy]`;

try {
  const r = A.render(code, {containerW:500, containerH:400});
  console.log('PASS: svg length', r.svg.length, 'cmds', r.commandMap.length);
} catch(e) {
  console.log('FAIL:', e.message);
  console.log(e.stack);
}
