'use strict';
// Identity-trace the C2 add() axis bug: tag axis cmds at pending-mark time,
// log at job run and at finalize, to see whether finalize sees the same objects.
const fs = require('fs');
global.window = {};
global.katex = require('katex');

let src = fs.readFileSync('asy-interp.js', 'utf8');

const tagX = "if (!_xSubpicJob) for (const c of myCmds) { c._jobManaged = true; c._jobPending = true; }";
const tagY = "if (!_ySubpicJob) for (const c of myCmds) { c._jobManaged = true; c._jobPending = true; }";
const tagRepl = (s) => s.replace('c._jobPending = true; }',
  "c._jobPending = true; c._dbgId = (globalThis.__dbgN = (globalThis.__dbgN || 0) + 1); }");
if (!src.includes(tagX) || !src.includes(tagY)) { console.error('tag anchors missing'); process.exit(1); }
src = src.replace(tagX, tagRepl(tagX));
src = src.replace(tagY, tagRepl(tagY));

const clr = "for (const c of myCmds) c._jobPending = false;";
const clrRepl = "for (const c of myCmds) { c._jobPending = false; if (c._isAxisLine) { try { process.stderr.write('[jobrun] axis=' + c._isAxisLine + ' id=' + c._dbgId + ' p0y=' + c.path.segs[0].p0.y.toFixed(1) + ' p3y=' + c.path.segs[0].p3.y.toFixed(1) + ' p0x=' + c.path.segs[0].p0.x.toFixed(1) + ' p3x=' + c.path.segs[0].p3.x.toFixed(1) + String.fromCharCode(10)); } catch (e) {} } }";
if (src.split(clr).length !== 3) { console.error('clr anchor count != 2:', src.split(clr).length - 1); process.exit(1); }
src = src.split(clr).join(clrRepl);

const fin = "process.stderr.write('[axfin] axis=' + c._isAxisLine";
if (!src.includes(fin)) { console.error('fin anchor missing'); process.exit(1); }
src = src.replace(fin, "process.stderr.write('[axfin] id=' + c._dbgId + ' pending=' + (!!c._jobPending) + ' axis=' + c._isAxisLine");

fs.writeFileSync('_asy_interp_traced.js', src);
process.env.HTX_AXFIN_DBG = '1';
require('./_asy_interp_traced.js');
const A = global.window.AsyInterp;

const base = 'size(200);\nimport olympiad;\n';
const geom = 'pair w=(0,0), x=(5,0), y=(4,3), z=(2,3);\ndraw(w--x--y--z--cycle);\ndraw(w--(7,0),invisible);\ndot(w);dot(x);dot(y);dot(z);\n';
const code = base + 'picture original = currentpicture;\ncurrentpicture = new picture;\nxaxis("$x$",Arrow);yaxis("$y$",Arrow);\n' + geom + 'add(original,currentpicture);\ncurrentpicture = original;\n';
A.render('[asy]\n' + code + '\n[/asy]', { containerW: 800, containerH: 600, labelOutput: 'svg-native' });
