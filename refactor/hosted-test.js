// Smoke test of the hosted editor: version, worker render of a labeled diagram.
const puppeteer=require('puppeteer');
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();const errs=[];
p.on('pageerror',e=>errs.push(e.message));
await p.goto(process.env.HTX_URL||'https://markeichenlaub.github.io/HiTeXeR/',{waitUntil:'load',timeout:60000});
await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:60000});
console.log('version:',await p.$eval('h1',e=>e.textContent.trim()));
await p.evaluate(()=>editor.setValue('size(120);\npair A=(0,0),B=(1,0),C=(0.3,0.8);\ndraw(A--B--C--cycle);\nlabel("$A$",A,SW);label("$\\frac{1}{2}$",B,SE);'));
await p.waitForFunction(()=>{const s=document.querySelector('#preview-container svg:not([data-perm])');return s&&document.getElementById('status').textContent==='Rendered'},{timeout:30000});
const info=await p.evaluate(()=>({paths:document.querySelectorAll('#preview-container svg:not([data-perm]) path').length, worker: typeof HTXRenderClient}));
console.log('rendered:',JSON.stringify(info),'page errors:',errs.length?errs:'none');
b.close().catch(()=>{});process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)});
