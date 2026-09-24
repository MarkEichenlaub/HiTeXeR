// circles, arcs, ellipses
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
wpath(unitcircle);
write(length(unitcircle));
write(point(unitcircle, 0.5));
write(point(unitcircle, 1));
write(arclength(unitcircle));
wpath(circle((1,2), 3));
write(point(circle((1,2), 3), 1.5));
write(arclength(circle((0,0), 2)));
write(relpoint(circle((0,0), 1), 0.125));
write(dir(circle((0,0), 1), 0.5));
wpath(arc((0,0), 1, 0, 90));
write(length(arc((0,0), 1, 0, 90)));
write(arclength(arc((0,0), 1, 0, 90)));
write(midpoint(arc((0,0), 1, 0, 90)));
write(endpoint(arc((0,0), 2, 0, 90)));
wpath(arc((0,0), 1, 90, 0));
wpath(arc((0,0), 1, 0, 270));
write(length(arc((0,0), 1, 0, 270)));
wpath(arc((0,0), 1, 0, 360));
wpath(arc((0,0), 1, -45, 45));
wpath(arc((0,0), 1, 30, 150));
wpath(arc((1,1), 2, 200, 340));
wpath(arc((0,0), 1, 0, 90, CW));
wpath(arc((0,0), 1, 90, 0, CCW));
write(length(arc((0,0), 1, 90, 0, CCW)));
wpath(arc((0,0), (1,0), (0,1)));
wpath(arc((0,0), (1,0), (0,1), CW));
wpath(arc((0,0), (2,0), (0,1)));
write(midpoint(arc((0,0), (2,0), (-2,0))));
wpath(arc((0,0), 1, 0, 10));
wpath(arc((0,0), 1, 0, 180));
wpath(arc((0,0), 3, 45, 135));
wpath(ellipse((0,0), 2, 1));
write(point(ellipse((0,0), 2, 1), 1));
write(arclength(ellipse((0,0), 2, 1)));
wpath(ellipse((1,1), 3, 1));
wpath(circle((0,0), 0.5));
//ASYERR write(Circle((0,0), 1, 8));
//ASYERR write(length(Circle((0,0), 1, 8)));
//ASYERR write(Arc((0,0), 1, 0, 90, 4));
//ASYERR write(length(Arc((0,0), 1, 0, 90)));
//ASYERR write(arclength(Arc((0,0), 1, 0, 90)));
write(intersectionpoint(unitcircle, (0,0)--(2,2)));
write(dir(arc((0,0), 1, 0, 90), 0));
write(dir(arc((0,0), 1, 90, 0), 0));
write(size(circle((0,0), 1)));
write(cyclic(circle((0,0), 1)));
write(cyclic(arc((0,0), 1, 0, 360)));
write(point(arc((0,0), 1, 0, 360), 4));
write(windingnumber(circle((0,0), 1), (0.5, 0)));
write(inside(circle((0,0), 1), (0.8, 0.8)));
wpath(reverse(unitcircle));
wpath(shift(1,1)*unitcircle);
wpath(scale(2)*unitcircle);
wpath(xscale(2)*unitcircle);
wpath(rotate(90)*arc((0,0),1,0,90));
write(arctime(unitcircle, pi/2));
write(arctime(circle((0,0),2), pi));
write(reltime(unitcircle, 0.3));
wpath(subpath(unitcircle, 1, 3));
write(point(unitcircle, 0.33333));
wpath(arc((0,0), 1, 0, -90));
wpath(arc((0,0), 1, 350, 10));
wpath(arc((0,0), 1, 10, 350));
wpath(arc((0,0), 1, 45, 45));
wpath(arc((2,0), 1, 180, 360));
write(length(arc((0,0), 1, 0, 45)));
write(length(arc((0,0), 1, 0, 100)));
write(length(arc((0,0), 1, 0, 181)));
write(point(arc((0,0), 1, 0, 120), 0.5));
write(dir(arc((0,0), 1, 0, 120), 1));
