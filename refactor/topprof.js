// node refactor/topprof.js file.cpuprofile — self-time by function
const p=JSON.parse(require('fs').readFileSync(process.argv[2]));const self={};const byId={};p.nodes.forEach(n=>byId[n.id]=n);
const dt={};for(let i=0;i<p.samples.length;i++){dt[p.samples[i]]=(dt[p.samples[i]]||0)+(p.timeDeltas[i]||0);}
for(const n of p.nodes){const k=n.callFrame.functionName+' :'+(n.callFrame.lineNumber+1);self[k]=(self[k]||0)+(dt[n.id]||0);}
const tot=Object.values(self).reduce((a,b)=>a+b,0);
Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,+(process.argv[3]||25)).forEach(([k,v])=>console.log((v/1000).toFixed(0).padStart(7)+'ms '+(100*v/tot).toFixed(1).padStart(5)+'% '+k));
