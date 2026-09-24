function fmt(n) { return Number(n.toFixed(4)); }
function fmtStr(n) {
  if (n === 0) return '0';
  const m = n * 1e4;
  if (m < 1e9 && m > -1e9) {
    const f = m - Math.floor(m);
    if (f < 0.499999 || f > 0.500001) {
      let k = Math.round(m);
      if (k === 0) return '0';
      const neg = k < 0;
      if (neg) k = -k;
      const q = Math.floor(k / 10000), r = k - q * 10000;
      let s = neg ? '-' + q : '' + q;
      if (r !== 0) {
        let fr = String(r + 10000).slice(1);
        while (fr.charCodeAt(fr.length - 1) === 48) fr = fr.slice(0, -1);
        s += '.' + fr;
      }
      return s;
    }
  }
  return String(Number(n.toFixed(4)));
}
let bad=0;const vals=[];
for(let i=0;i<3e6;i++){const r=Math.random();vals.push(r<0.3?(Math.random()-0.5)*2000:r<0.6?Math.round((Math.random()-0.5)*1e7)/1e5:r<0.8?(Math.random()-0.5)*1e-3:Math.round((Math.random()-0.5)*1e6)/2e4);}
vals.push(0,-0,0.00005,-0.00005,-0.00004,1e-12,123456.78905,NaN,Infinity,-Infinity,1e20,99999.99995,0.1+0.2,-1.5,-0.5,100000,-99999.9999,0.0001,-0.0001);
for(const v of vals){const a=String(fmt(v)),b=fmtStr(v);if(a!==b&&bad++<5)console.log('MISMATCH',v,a,b);}
console.log(vals.length,'values,',bad,'mismatches');
let t=Date.now();let x=0;for(const v of vals)x+=String(fmt(v)).length;const t1=Date.now()-t;t=Date.now();for(const v of vals)x+=fmtStr(v).length;console.log('String(fmt)',t1,'ms; fmtStr',Date.now()-t,'ms');
