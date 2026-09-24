const fs=require('fs'),path=require('path');global.window={};global.katex=require('katex');console.log=console.warn=()=>{};
require(path.join(__dirname,'../../asy-interp.js'));const code='[asy]\n'+fs.readFileSync(process.argv[2],'utf8')+'\n[/asy]';
for(let r=0;r<(+process.argv[3]||1);r++)window.AsyInterp._createInterpreter().execute(code,{containerW:800,containerH:600,labelOutput:'svg-native'});
