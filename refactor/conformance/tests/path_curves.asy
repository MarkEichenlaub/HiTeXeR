// Hobby spline control points (.. with direction specifiers)
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
path c = (0,0)..(1,1)..(2,0);
wpath(c);
write(precontrol(c, 1));
write(postcontrol(c, 1));
write(postcontrol(c, 0));
write(precontrol(c, 2));
write(point(c, 0.5));
write(point(c, 1.5));
write(dir(c, 0));
write(dir(c, 1));
write(arclength(c));
write(arctime(c, 1));
write(relpoint(c, 0.5));
write(midpoint(c));
write(min(c));
write(max(c));
wpath((0,0)..(1,1)..(2,0)..cycle);
wpath((0,0)..(2,0)..(2,2)..(0,2)..cycle);
wpath((0,0){up}..(1,1)..{down}(2,0));
wpath((0,0){dir(60)}..(2,0));
wpath((0,0){right}..{left}(1,1));
wpath((0,0)--(1,0)..(2,1)..(3,0)--(4,0));
wpath((0,0)..(1,0)--(2,1));
wpath((0,0){up}..{right}(1,1)--(2,1));
wpath((0,0)..(1,2)..(3,3)..(4,1)..(6,0));
wpath((0,0)..(5,1)..(6,5)..(2,3)..cycle);
wpath((0,0)..(1,0)..(1,1)..(0,1)..cycle);
wpath((0,0)..(3,0)..(3,0.1));
wpath((0,0)..(1,1){right}..(2,0));
wpath((0,0)..{up}(1,1){down}..(2,0));
wpath((1,0)..(0,1)..(-1,0)..(0,-1)..cycle);
wpath((0,0)..(1,1)..(1,1)..(2,0));
wpath((0,0)..(0,0)..(1,0));
wpath((0,0){(1,1)}..(3,0));
wpath((0,0){up}..(2,0));
wpath((0,0){up}..{up}(2,0));
wpath((0,0){left}..(1,0));
wpath((0,0)--(1,0){up}..(2,1));
wpath((0,0)..(1,0){up}..{left}(0,1)..cycle);
wpath((0,0)..(1,0)..{left}cycle);
wpath((0,0){right}..(1,1)..cycle);
wpath((0,0)..(1,0)..(2,0));
path s = (0,0)..(1,2)..(3,3)..(4,1);
write(arclength(s));
write(arctime(s, 2.5));
write(point(s, arctime(s, 2.5)));
write(dir(s, 1.5));
write(accel(s, 1.5));
write(radius(s, 1.0));
wpath(subpath(s, 0.5, 2.5));
wpath(reverse(s));
write(reltime(s, 0.3));
write(relpoint(s, 0.3));
write(dirtime(s, (1,0)));
write(dirtime(s, (0,-1)));
write(max(s));
write(min(s));
wr(mintimes(s));
wr(maxtimes(s));
