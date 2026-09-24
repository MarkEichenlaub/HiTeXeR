// Headless check of the editor: page loads, worker renders match in-page renders.
const puppeteer=require('puppeteer');
(async()=>{
 const b=await puppeteer.launch({headless:'new'});const p=await b.newPage();
 const logs=[];p.on('console',m=>logs.push(m.type()+': '+m.text()));p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
 const t0=Date.now();
 await p.goto('http://localhost:8765/index.html',{waitUntil:'load',timeout:60000});
 console.log('loaded in',Date.now()-t0,'ms');
 await p.waitForFunction(()=>window.katexSvg&&katexSvg.ready(),{timeout:30000});
 await new Promise(r=>setTimeout(r,2000));
 console.log('status:',await p.$eval('#status',e=>e.textContent));
 const ids=(process.argv[2]||'00001,00133,05896,07603,08663,12854,04240,00091').split(',');
 const res=await p.evaluate(async(ids)=>{const out=[];
  for(const id of ids){const src=await (await fetch('comparison/asy_src/'+id+'.asy')).text();const code='[asy]\n'+src+'\n[/asy]';
   let a,b;try{a=AsyInterp.render(code,{containerW:800,containerH:600}).svg}catch(e){a='ERR '+e.message}
   const t=performance.now();try{b=(await HTXRenderClient.render(code,{containerW:800,containerH:600})).svg}catch(e){b='ERR '+e.message}
   out.push(id+' '+(a===b?'same':'DIFF '+a.slice(0,80)+' | '+b.slice(0,80))+' worker '+(performance.now()-t).toFixed(0)+'ms');}
  return out;},ids);
 console.log(res.join('\n'));
 console.log(logs.filter(l=>/error|worker/i.test(l)).slice(0,20).join('\n'));
 await b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
