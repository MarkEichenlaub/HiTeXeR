// olympiad.asy geometry helpers (AoPS)
import olympiad;
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
pair A = (0,0), B = (5,0), C = (1,4);
write(circumcenter(A, B, C));
write(circumradius(A, B, C));
write(incenter(A, B, C));
write(inradius(A, B, C));
write(orthocenter(A, B, C));
write(centroid(A, B, C));
write(foot(C, A, B));
write(foot(A, B, C));
write(foot(B, C, A));
write(bisectorpoint(A, B));
write(bisectorpoint(A, B, C));
write(bisectorpoint(C, A, B));
write(midpoint(A--B));
write(midpoint(A--B--C));
write(midpoint((0,0)..(1,1)..(2,0)));
write(waypoint(A--B--C, 0.25));
wpath(circumcircle(A, B, C));
wpath(incircle(A, B, C));
write(tangent((5,0), (0,0), 3));
write(tangent((5,0), (0,0), 3, 2));
write(tangent((0,5), (1,1), 2, 1));
write(cyclic((1,0), (0,1), (-1,0), (0,-1)));
write(cyclic((1,0), (0,1), (-1,0), (0,-2)));
write(collinear((0,0), (1,1), (3,3)));
write(collinear((0,0), (1,1), (3,3.1)));
write(concurrent((0,0),(2,2),(0,2),(2,0),(1,0),(1,2)));
wpath(rightanglemark(A, B, C));
wpath(rightanglemark((1,0), (0,0), (0,1), 10));
wpath(anglemark(A, B, C));
wpath(anglemark(B, A, C, 20));
pair D = (2,3), E = (7,1), F = (4,-2);
write(circumcenter(D, E, F));
write(incenter(D, E, F));
write(orthocenter(D, E, F));
write(circumradius(D, E, F));
write(inradius(D, E, F));
write(foot(D, E, F));
write(bisectorpoint(D, E, F));
write(incenter((0,0), (4,0), (0,3)));
write(inradius((0,0), (4,0), (0,3)));
write(circumcenter((0,0), (4,0), (0,3)));
write(orthocenter((0,0), (4,0), (0,3)));
write(extension(A, C, B, (3,3)));
write(intersectionpoints(circumcircle(A,B,C), (-10,1)--(10,1)).length);
wp(intersectionpoints(circumcircle(A,B,C), (-10,1)--(10,1)));
write(abs(circumcenter(A,B,C) - A));
write(dir(A--B--C, 1));
write(length(circumcircle(A, B, C)));
write(point(circumcircle(A, B, C), 0));
write(point(incircle(A, B, C), 0));
write(point(circumcircle(D, E, F), 1.5));
write(arclength(circumcircle(A, B, C)));
write(intersectionpoint(circumcircle(A,B,C), C--(10,10)));
