const puppeteer=require('puppeteer');
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
await p.goto('http://localhost:8765/index.html',{waitUntil:'load'});
await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:30000});await new Promise(r=>setTimeout(r,1500));
const r=await p.evaluate(async(id)=>{const src=await (await fetch('comparison/asy_src/'+id+'.asy')).text();const code='[asy]\n'+src+'\n[/asy]';
const a=AsyInterp.render(code,{containerW:800,containerH:600}).svg;const b=(await HTXRenderClient.render(code,{containerW:800,containerH:600})).svg;
let i=0;while(i<a.length&&a[i]===b[i])i++;return a.slice(i-200,i+150)+'\n====\n'+b.slice(i-200,i+150)},process.argv[2]);
console.log(r);process.exit(0)})();
