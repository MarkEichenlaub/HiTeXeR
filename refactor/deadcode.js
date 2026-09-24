// Lists function declarations in a file whose name appears nowhere else.
const s=require('fs').readFileSync(process.argv[2]||'asy-interp.js','utf8');
const decl=[...s.matchAll(/^[ \t]*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)];
const counts=new Map();for(const m of s.matchAll(/[A-Za-z_$][\w$]*/g))counts.set(m[0],(counts.get(m[0])||0)+1);
const dead=decl.filter(m=>counts.get(m[1])===1).map(m=>m[1]+':'+(s.slice(0,m.index).split('\n').length));
console.log(dead.length+' unreferenced:\n'+dead.join('\n'));
