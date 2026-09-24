// node refactor/hotlines.js file.cpuprofile [N] — hottest source lines (self ticks)
const p=JSON.parse(require('fs').readFileSync(process.argv[2]));const lines={};
for(const n of p.nodes){if(!n.positionTicks)continue;for(const t of n.positionTicks){const k=n.callFrame.functionName+':'+t.line;lines[k]=(lines[k]||0)+t.ticks;}}
Object.entries(lines).sort((a,b)=>b[1]-a[1]).slice(0,+(process.argv[3]||25)).forEach(([k,v])=>console.log(String(v).padStart(6),k));
