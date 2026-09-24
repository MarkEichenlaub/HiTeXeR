// intersections
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
path a = (0,0)--(4,4);
path b = (0,4)--(4,0);
write(intersectionpoint(a, b));
wr(intersect(a, b));
write(intersectionpoints(a, b).length);
write(intersectionpoints(a, b)[0]);
path c = circle((0,0), 2);
path l = (-3,1)--(3,1);
pair[] ip = intersectionpoints(c, l);
write(ip.length);
write(ip[0]);
write(ip[1]);
wr(intersect(c, l));
wr(intersect(l, c));
real[][] t = intersections(c, l);
write(t.length);
write(t[0][0]);
write(t[0][1]);
write(t[1][0]);
write(t[1][1]);
write(intersections(l, c)[0][0]);
write(intersections(l, c)[1][0]);
path c2 = circle((2,0), 2);
pair[] cc = intersectionpoints(c, c2);
write(cc.length);
write(cc[0]);
write(cc[1]);
write(intersectionpoint(c, c2));
write(intersectionpoints((0,0)--(1,0), (0,1)--(1,1)).length);
write(intersect((0,0)--(1,0), (0,1)--(1,1)).length);
wr(times(c, 1));
wr(times(c, (1,0)));
wr(times(l, 0));
wr(times((0,0)--(4,0)--(4,4), 2));
wr(times((0,0)--(4,0)--(4,4), (0,1)));
path sq = (0,0)--(2,0)--(2,2)--(0,2)--cycle;
path diag = (-1,-1)--(3,3);
pair[] sd = intersectionpoints(sq, diag);
write(sd.length);
write(sd[0]);
write(sd[1]);
write(intersections(sq, diag).length);
write(intersections(sq, (1,-1)--(1,3))[0][0]);
write(intersections(sq, (1,-1)--(1,3))[1][0]);
write(intersections(sq, (-1,1), (1,0)).length);
write(intersections(sq, (-1,1), (1,0))[0]);
write(intersectionpoints(unitcircle, (0,0)--(1,1))[0]);
write(intersectionpoint(unitcircle, (0,0)--(dir(30)*2)));
pair[] ci = intersectionpoints(circle((0,0),1), circle((1,1),1));
write(ci.length);
write(ci[0]);
write(ci[1]);
path s = (0,0)..(1,2)..(3,0);
write(intersectionpoint(s, (0,1)--(3,1)));
write(intersectionpoints(s, (0,1)--(3,1)).length);
//ASYERR write(intersectionpoints(s, (0,1)--(3,1))[1]);
wr(intersect(s, (0,1)--(3,1)));
write(extension((0,0), (1,1), (0,2), (1,1)));
write(extension((0,0), (1,0), (0,1), (1,1)));
write(extension((0,0), (2,1), (3,0), (3,5)));
write(intersectionpoint((0,0)--(1,1), (0,0)--(1,-1)));
write(intersectionpoints(arc((0,0),1,0,180), (-2,0.5)--(2,0.5)).length);
write(intersectionpoints(arc((0,0),1,0,180), (-2,0.5)--(2,0.5))[0]);
write(intersectionpoints(arc((0,0),1,0,180), (-2,0.5)--(2,0.5))[1]);
write(intersectionpoints((0,0)--(2,0)--(2,2), (1,-1)--(1,1)--(3,1)).length);
write(intersectionpoints(circle((0,0),1), (1,-1)--(1,1)).length);
write(intersectionpoints(circle((0,0),1), (1,-1)--(1,1))[0]);
write(intersectionpoints(circle((0,0),3), circle((4,0),2))[0]);
write(intersectionpoints(circle((0,0),3), circle((4,0),2))[1]);
write(intersectionpoint(circle((0,0),3), (0,0)--(5,5)));
write(intersectionpoint((0,0)--(10,3), (5,-5)--(5,5)));
write(intersectionpoints((0,0)..(2,2)..(4,0), (0,1)--(4,1))[0]);
write(intersectionpoints((0,0)..(2,2)..(4,0), (0,1)--(4,1))[1]);
