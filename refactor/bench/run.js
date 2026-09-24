// node refactor/bench/run.js [reps] — interpreter-only timing (execute, no SVG), min of reps
const fs=require('fs'),path=require('path');global.window={};global.katex=require('katex');const cl=console.log;console.log=console.warn=()=>{};
require(path.join(__dirname,'../../asy-interp.js'));const A=window.AsyInterp;
const reps=+(process.argv[2]||3);let tot=0;
for(const f of fs.readdirSync(__dirname).filter(f=>f.endsWith('.asy'))){const code='[asy]\n'+fs.readFileSync(path.join(__dirname,f),'utf8')+'\n[/asy]';
 let best=1e9;for(let r=0;r<reps;r++){const t=process.hrtime.bigint();A._createInterpreter().execute(code,{containerW:800,containerH:600,labelOutput:'svg-native'});best=Math.min(best,Number(process.hrtime.bigint()-t)/1e6);}
 tot+=best;cl(f.padEnd(12),best.toFixed(0)+'ms');}
cl('total'.padEnd(12),tot.toFixed(0)+'ms');
