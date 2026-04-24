const fs = require('fs');
global.window = {};
global.document = { createElement: () => ({ getContext: () => null }) };
require('./asy-interp.js');

// Wrap picture.commands.push to log what draw commands are being queued
const A = window.AsyInterp;

// Minimal reproduction: 3D straight lines
const src = `
import three;
size(150);
currentprojection=perspective(4,1,2);
real radius=1, theta=37, phi=60;
triple pP=radius*dir(theta,phi);
real r=1.5;
draw(O--r*X);
draw(O--radius*dir(90,phi)^^O--pP, dashed);
draw(pP--(pP + .4*(cos(theta*pi/180)*cos(phi*pi/180), cos(theta*pi/180)*sin(phi*pi/180), -sin(theta*pi/180))), red);
`;

let r = A.render(src, { format: 'svg' });
if (typeof r === 'object' && r.svg) r = r.svg;
// Extract just the path d attributes
const paths = r.match(/<path d="[^"]*"/g) || [];
for (const p of paths) console.log(p);
