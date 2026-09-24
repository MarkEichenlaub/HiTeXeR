// cse5.asy helpers (AoPS)
import cse5;
// ---- printing helpers: avoid depending on write(array)/write(path)/string(real) formats
// (those are tested separately in write_format.asy). One value per output line.
void wi(int[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wr(real[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wb(bool[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void ws(string[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wp(pair[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wi2(int[][] a) { write("rows=" + string(a.length)); for (int i = 0; i < a.length; ++i) { wi(a[i]); } }
void wr2(real[][] a) { write("rows=" + string(a.length)); for (int i = 0; i < a.length; ++i) { wr(a[i]); } }
// path: node count, then per segment: start, control1, control2 (recovered from
// point() at t=1/3, 2/3 so it needs only point()/length()), then the end node.
void wpath(path g) { int n = length(g); write("len=" + string(n)); for (int i = 0; i < n; ++i) { pair P0 = point(g, i), P3 = point(g, i+1); pair U = 27*point(g, i+1/3) - 8*P0 - P3; pair V = 27*point(g, i+2/3) - P0 - 8*P3; write(P0); write((2*U - V)/18); write((2*V - U)/18); } write(point(g, n)); }
// ---- end helpers
pair A = (0,0), B = (4,0), C = (1,3);
write(d(A, B));
write(d(A, C));
wpath(CR(A, 2));
wpath(CR((1,1), 1, 0, 90));
wpath(CP(A, B));
wpath(L(A, B));
wpath(L(A, B, 0.5, 1));
wpath(L(1, A, B));
wp(IPs(CR(A, 2), (-3,1)--(3,1)));
write(IP(CR(A, 2), (-3,1)--(3,1)));
write(IP(CR(A, 2), (-3,1)--(3,1), 1));
write(OP(CR(A, 2), (-3,1)--(3,1)));
write(WP(A--B--C));
write(WP(A--B--C, 0.25));
wp(commonpoints(CR(A,2), CR(B,3)));
