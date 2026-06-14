global.window=global.window||{};
global.katex=require('katex');
const A=require('./asy-interp.js');
// _mjxMeasureBp is module-internal; try to access via global or re-require trick.
// Instead, render with a hook: monkeypatch not possible. Use the exported measure if any.
const labels=['$\leftarrow$\,satellite','planet','$d$','$\theta$','$v$','satellite','$\leftarrow$ satellite'];
const m = global._mjxMeasureBp || (typeof _mjxMeasureBp!=='undefined'?_mjxMeasureBp:null);
console.log('global measure fn?', !!m);
