// path construction and query functions on straight/polygonal paths
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
path p = (0,0)--(4,0)--(4,3);
write(length(p));
write(size(p));
write(cyclic(p));
write(point(p, 0));
write(point(p, 1));
write(point(p, 1.5));
write(point(p, 2));
write(point(p, 3));
write(point(p, -1));
write(point(p, 0.25));
write(arclength(p));
write(arctime(p, 5));
write(arctime(p, 2));
write(arctime(p, 100));
write(reltime(p, 0.5));
write(relpoint(p, 0.5));
write(relpoint(p, 0));
write(relpoint(p, 1));
write(midpoint(p));
write(beginpoint(p));
write(endpoint(p));
write(min(p));
write(max(p));
write(dir(p, 0));
write(dir(p, 1));
write(dir(p, 0.5));
write(dir(p, 2));
write(dir(p));
//ASYERR write(direction(p, 1));
write(precontrol(p, 1));
write(postcontrol(p, 1));
write(precontrol(p, 0));
write(postcontrol(p, 0.5));
wpath(p);
path q = (0,0)--(1,0)--(1,1)--(0,1)--cycle;
wpath(q);
write(length(q));
write(size(q));
write(cyclic(q));
write(point(q, 4));
write(point(q, 5));
write(point(q, -0.5));
write(arclength(q));
write(relpoint(q, 0.5));
write(midpoint(q));
write(dir(q, 0));
write(dir(q, 4));
wpath(reverse(p));
wpath(subpath(p, 0.5, 1.5));
wpath(subpath(p, 2, 1));
wpath(subpath(q, 3, 5));
wpath(p--(0,0));
wpath(p & (4,3)--(0,3));
wpath((0,0)---(1,1)---(2,0));
path pp = (0,0);
write(length(pp));
write(size(pp));
write(pp);
path e;
write(length(e));
write(size(e));
wpath(box((0,0), (2,1)));
wpath(unitsquare);
wpath(polygon(4));
wpath(polygon(3));
write(length(polygon(6)));
write(point(polygon(5), 0));
wpath((0,0)--(1,1)--(2,2));
write(straight((0,0)--(1,1), 0));
write(straight((0,0)..(1,1)..(2,0), 0));
write(piecewisestraight((0,0)--(1,1)));
write(piecewisestraight((0,0)..(1,1)));
write(arclength((0,0)--(3,4)));
write(arclength(subpath(q, 1, 2.5)));
path[] pa = (0,0)--(1,0) ^^ (0,1)--(1,1);
write(pa.length);
write(length(pa[1]));
write(point(pa[1], 0.5));
write(min(pa));
write(max(pa));
write(size(pa));
write(windingnumber(q, (0.5,0.5)));
write(windingnumber(q, (2,2)));
write(windingnumber(reverse(q), (0.5,0.5)));
write(inside(q, (0.5, 0.5)));
write(inside(q, (1.5, 0.5)));
write(inside(q, (1, 0.5)));
write(accel(p, 1));
write(radius(p, 0.5));
write(dirtime(p, (0,1)));
write(cyclic((0,0)--(1,0)--cycle));
write(length((0,0)--(1,0)--cycle));
wpath((0,0)--(1,0)--cycle);
write(arclength(unitsquare));
write(xpart(point(p, 1.25)));
write(ypart(max(p)));
write(point(p, 1.0000001));
write(arctime(q, 2.5));
write(point(q, arctime(q, 2.5)));
write(length(p--cycle));
wpath(p--cycle);
wpath(subpath(q, 0.5, 3.5));
wpath(subpath(p, -1, 5));
wpath(reverse(q));
write(length(reverse(q)));
