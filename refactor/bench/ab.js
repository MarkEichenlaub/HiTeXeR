// node refactor/bench/ab.js [rounds] — interleaved A/B: HEAD interpreter vs working tree.
const cp=require('child_process'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');const snap=path.join(ROOT,'refactor/.gate/snap-bench');fs.mkdirSync(snap,{recursive:true});
for(const f of ['asy-interp.js','katex-svg.js'])fs.writeFileSync(path.join(snap,f),cp.execFileSync('git',['show','HEAD:'+f],{cwd:ROOT,maxBuffer:1<<28}));
fs.copyFileSync(path.join(ROOT,'katex-glyphs.json'),path.join(snap,'katex-glyphs.json'));
const files=fs.readdirSync(__dirname).filter(f=>f.endsWith('.asy'));
const script=(interp,file)=>`const fs=require('fs');global.window={};global.katex=require(${JSON.stringify(require.resolve('katex'))});console.log=console.warn=()=>{};require(${JSON.stringify(interp)});
const code='[asy]'+String.fromCharCode(10)+fs.readFileSync(${JSON.stringify(file)},'utf8')+String.fromCharCode(10)+'[/asy]';const A=window.AsyInterp;
A._createInterpreter().execute(code,{containerW:800,containerH:600,labelOutput:'svg-native'});
let best=1e9;for(let r=0;r<3;r++){const t=process.hrtime.bigint();A._createInterpreter().execute(code,{containerW:800,containerH:600,labelOutput:'svg-native'});best=Math.min(best,Number(process.hrtime.bigint()-t)/1e6);}
process.stdout.write(String(best));`;
const rounds=+(process.argv[2]||2);const res={};
for(let r=0;r<rounds;r++)for(const f of files)for(const [k,interp] of [['old',path.join(snap,'asy-interp.js')],['new',path.join(ROOT,'asy-interp.js')]]){
 const ms=+cp.execFileSync(process.execPath,['-e',script(interp,path.join(__dirname,f))],{encoding:'utf8'});
 res[f]=res[f]||{old:1e9,new:1e9};res[f][k]=Math.min(res[f][k],ms);}
let to=0,tn=0;for(const f of files){const {old,new:nw}=res[f];to+=old;tn+=nw;console.log(f.padEnd(12),old.toFixed(0).padStart(7),'->',nw.toFixed(0).padStart(7),'ms  x'+(old/nw).toFixed(2));}
console.log('total'.padEnd(12),to.toFixed(0).padStart(7),'->',tn.toFixed(0).padStart(7),'ms  x'+(to/tn).toFixed(2));
