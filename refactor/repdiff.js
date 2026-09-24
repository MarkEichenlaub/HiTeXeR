// node refactor/repdiff.js id — render twice in-process, print first difference
global.window={};global.katex=require('katex');console.log=()=>{};require('../asy-interp.js');
const src=require('fs').readFileSync(require('path').join(__dirname,'../comparison/asy_src',process.argv[2]+'.asy'),'utf8');
const a=[0,1].map(()=>window.AsyInterp.render('[asy]\n'+src+'\n[/asy]',{containerW:800,containerH:600}).svg);
let i=0;while(i<a[0].length&&a[0][i]===a[1][i])i++;
process.stdout.write(i>=a[0].length&&a[0].length===a[1].length?'identical\n':a[0].slice(i-150,i+100)+'\n=====\n'+a[1].slice(i-150,i+100)+'\n');
