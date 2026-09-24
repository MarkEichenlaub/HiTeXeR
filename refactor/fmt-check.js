// Brute-force check that fastFmt === Number(n.toFixed(4)) and time both.
function fmt(n) { return Number(n.toFixed(4)); }
function fastFmt(n) {
  if (n === 0) return 0;
  const m = n * 1e4;
  if (m < 1e9 && m > -1e9) {
    const f = m - Math.floor(m);
    if (f < 0.499999 || f > 0.500001) return Math.round(m) / 1e4;
  }
  return Number(n.toFixed(4));
}
let bad = 0, N = 0;
const vals = [];
for (let i = 0; i < 3e6; i++) {
  const r = Math.random();
  vals.push(r < 0.3 ? (Math.random() - 0.5) * 2000 : r < 0.6 ? Math.round((Math.random() - 0.5) * 1e7) / 1e5 : r < 0.8 ? (Math.random() - 0.5) * 1e-3 : Math.round((Math.random()-0.5)*1e6)/2e4);
}
vals.push(0, -0, 0.00005, -0.00005, 1e-12, 123456.78905, NaN, Infinity, -Infinity, 1e20, 99999.99995, 0.1+0.2);
for (const v of vals) { N++; const a = fmt(v), b = fastFmt(v); if (!(Object.is(a, b) || (a !== a && b !== b)) || String(a) !== String(b)) { if (bad++ < 5) console.log('MISMATCH', v, a, b); } }
console.log(N, 'values,', bad, 'mismatches');
let t = Date.now(), x = 0; for (const v of vals) x += fmt(v) || 0; const t1 = Date.now() - t;
t = Date.now(); for (const v of vals) x += fastFmt(v) || 0; console.log('toFixed', t1, 'ms; fast', Date.now() - t, 'ms');
