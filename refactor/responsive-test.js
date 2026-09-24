// Editor stays responsive during a slow render, and a newer edit cancels it.
const puppeteer=require('puppeteer');const fs=require('fs');
(async()=>{const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
await p.goto('http://localhost:8765/index.html',{waitUntil:'load'});
await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:30000});await new Promise(r=>setTimeout(r,2000));
const heavy='real s=0; for(int i=0;i<3000000;++i) s+=sin(i); dot((s,0));';
await p.evaluate(src=>{editor.setValue(src)},heavy);
await new Promise(r=>setTimeout(r,600));
// main thread latency while heavy render is running
const t0=Date.now();const st=await p.evaluate(()=>document.getElementById('status').textContent);console.log('main thread answered in',Date.now()-t0,'ms; status:',st);
const t1=Date.now();
await p.evaluate(()=>editor.setValue('size(100);\ndraw(unitcircle,red);'));
await p.waitForFunction(()=>{const s=document.querySelector('#preview-container svg:not([data-perm])');return s&&/stroke="#ff0000"/.test(s.outerHTML)},{timeout:20000});
console.log('small edit shown',Date.now()-t1,'ms after typing');
await new Promise(r=>setTimeout(r,1500));
console.log('final status:',await p.evaluate(()=>document.getElementById('status').textContent));
b.close().catch(()=>{});process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)});
