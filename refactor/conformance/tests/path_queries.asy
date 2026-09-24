// path queries: intersections edge cases (collinear overlap, tangency, nodes),
// line intersections, arctime wrap, dir fallbacks, accel/radius, subpath wrap,
// mintimes/maxtimes ties, windingnumber/inside on the boundary.
void wr(real[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wp(pair[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wr2(real[][] a) { write("rows=" + string(a.length)); for (int i = 0; i < a.length; ++i) { wr(a[i]); } }
void wpath(path g) { int n = length(g); write("len=" + string(n)); for (int i = 0; i < n; ++i) { pair P0 = point(g, i), P3 = point(g, i+1); pair U = 27*point(g, i+1/3) - 8*P0 - P3; pair V = 27*point(g, i+2/3) - P0 - 8*P3; write(P0); write((2*U - V)/18); write((2*V - U)/18); } write(point(g, n)); }
// ---- end helpers
path sq = (0,0)--(4,0)--(4,4)--(0,4)--cycle;
wr2(intersections(sq, (-1,0)--(5,0)));
wr2(intersections((-1,0)--(5,0), sq));
wr2(intersections((0,0)--(2,0), (1,0)--(3,0)));
wp(intersectionpoints((0,0)--(2,0), (1,0)--(3,0)));
wr2(intersections((0,0)--(2,0), (2,0)--(3,1)));
wr2(intersections(sq, (4,0)--(8,0)));
wr2(intersections(sq, (-1,-1)--(1,1)));
wr2(intersections(sq, (0,0)--(1,1)));
wr2(intersections(sq, (-1,1)--(0,0)));
wr2(intersections(unitcircle, (1,-1)--(1,1)));
wr2(intersections(unitcircle, (-1,0)--(1,0)));
wr2(intersections(unitcircle, (0,-1)--(2,1)));
wr2(intersections((0,0)--(4,0), (0,0)--(4,0)));
wr(intersect((0,0)--(2,0), (1,0)--(3,0)));
path e = rotate(30)*ellipse((0,0),2,1);
pair z = point(e,0);
wr2(intersections(e, (z-(0,1))--(z+(0,1))));
wr(intersections(unitcircle, (0,0), (1,1)));
wr(intersections((0,0)--(4,0)--(4,4), (2,-1), (2,1)));
wr(times(unitcircle, 0));
wr(times(unitcircle, (0,0.5)));
write(intersectionpoint((0,0)..(1,2)..(3,0), (0,1)--(3,1)));
write(extension((0,0), (1,1e-20), (0,1), (1,1)));
write(extension((0,0), (0,0), (2,0), (3,1)));
path p = (0,0)--(4,0)--(4,3);
path q = (0,0)--(1,0)--(1,1)--(0,1)--cycle;
write(dir(p, 0.5));
write(dir(p, -1));
write(dir(p, 3));
write(dir(q, -0.5));
write(dir(q, 4.5));
write(dir(q, 5));
write(dir((0,0)..controls (0,0) and (1,1)..(2,0), 0));
write(dir((0,0)..controls (0,0) and (0,0)..(2,0), 0));
write(dir((0,0)..controls (2,0) and (0,0)..(2,0), 0.5));
write(dir((0,0)..controls (1,1) and (2,0)..(2,0), 1));
write(accel((0,0)..(1,1)..(2,0), 1));
write(accel((0,0)..(1,1)..(2,0), 0));
write(radius((0,0)..(1,1)..(2,0), 1));
write(radius((0,0)..(1,1)..(2,0), 0.3));
write(radius(q, 1));
write(arctime(unitcircle, 100));
write(arctime(unitcircle, -1));
write(arctime(q, -1));
write(arctime(p, -1));
write(arctime(q, 9));
write(arclength(unitcircle));
write(relpoint(unitcircle, 0.3));
write(size(nullpath));
write(size((0,0)--cycle));
write(point(q, -1));
write(straight(q, 4));
write(straight(q, -1));
write(dirtime(q, (-1,0)));
write(dirtime(q, (1,1)));
write(windingnumber((0,0)--(1,0)--(1,1)--(0,1)--(0,0)--(1,0)--(1,1)--(0,1)--cycle, (0.5,0.5)));
write(inside(q, (0,0)));
write(inside(q, (2,0)));
write(inside(q, (0.5,0.5)));
write(inside(sq, (1,1)--(2,2)));
write(inside((1,1)--(2,2)--(1,2)--cycle, sq));
write(inside(sq, (-1,-1)--(2,2)));
wr(maxtimes(q));
wr(mintimes(q));
wr(maxtimes((0,0)..(1,1)..(2,0)));
wr(mintimes((0,0)..(1,1)..(2,0)));
write(min((1,2)--cycle));
wpath(subpath(q, -1, 1.5));
wpath(subpath(p, -1, 1.5));
wpath(subpath(q, 4.5, 1.5));
wpath(subpath(q, 0, 8));
write(length(subpath(p, 1.5, 1.5)));
write(point(subpath(p, 1.5, 1.5), 0));
write(length(subpath(q, 0, 4)));
