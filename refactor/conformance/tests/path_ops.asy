// path operators and point queries on joined / transformed paths (AoPS idioms)
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
path tri = A--B--C--cycle;
write(length(tri));
write(arclength(tri));
write(point(tri, 1.5));
write(point(tri, 2.5));
write(point(tri, 3));
write(relpoint(tri, 0.5));
write(midpoint(tri));
write(dir(tri, 1));
write(dir(tri, 0));
write(dir(tri, 3));
write(min(tri));
write(max(tri));
wpath(tri);
wpath(reverse(tri));
wpath(subpath(tri, 1, 2));
wpath(subpath(tri, 2.5, 0.5));
wpath(shift(1,1)*tri);
wpath(rotate(90)*tri);
wpath(scale(2)*tri);
wpath(reflect(A, B)*tri);
path[] both = tri ^^ (A--C);
write(both.length);
wpath(both[1]);
path two = A--B & B--C;
wpath(two);
write(length(two));
path open = A--B--C;
write(length(open--cycle));
wpath(open--cycle);
wpath(A--B..C);
wpath(A..B--C);
wpath(A..B..C);
wpath(A..B..C..cycle);
wpath(A{up}..B);
wpath(A..{down}B);
wpath(A{dir(45)}..{dir(-45)}B);
wpath(A{N}..B..{S}C);
wpath(C..A{right}..B);
wpath((0,0)..(1,1)..(2,0)..(3,1));
wpath((0,0)..(1,1)..(2,0)..(3,1)..cycle);
wpath((0,0)..(2,1)..(4,0)..(2,-1)..cycle);
wpath((-1,0)..(0,1)..(1,0));
wpath((0,0)..(4,0)..(4,4));
wpath((0,0)--(1,0)..(2,1)--(3,1));
wpath((0,0)..(1,0)..(2,0)..(2,1));
wpath((0,0)..(1,1)--(2,1)..(3,0));
wpath(A--B--C..cycle);
wpath(A..B..C--cycle);
write(arclength(A..B..C));
write(arctime(A..B..C, 3));
write(point(A..B..C, 0.5));
write(dir(A..B..C, 1));
write(dir(A..B..C..cycle, 0));
write(intersectionpoint(A..B..C, (2,-5)--(2,5)));
write(max(A..B..C..cycle));
write(min(A..B..C..cycle));
