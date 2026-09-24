// arrays
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
int[] a = {3, 1, 4, 1, 5};
wi(a);
write(a.length);
write(a[0]);
write(a[4]);
real[] r = {1.5, 2, 0.25};
wr(r);
write(sum(a));
write(sum(r));
write(max(a));
write(min(r));
wi(sequence(5));
wi(sequence(2, 6));
wi(sequence(new int(int i) {return i*i;}, 4));
wi(array(3, 7));
wr(array(2, 0.5));
int[] b = copy(a);
b[0] = 99;
write(a[0]);
write(b[0]);
int[] c = a;
c[1] = 42;
write(a[1]);
a.push(9);
wi(a);
write(a.pop());
wi(a);
a.append(new int[]{7, 8});
wi(a);
a.insert(1, 100);
wi(a);
a.delete(0);
wi(a);
a.delete(1, 2);
wi(a);
a.delete();
write(a.length);
int[] d = {5, 3, 8, 1};
wi(sort(d));
wi(d);
wi(reverse(d));
wr(sort(new real[]{2.5, -1, 0}));
ws(sort(new string[]{"b", "A", "a"}));
write(search(new int[]{1, 3, 5, 7}, 4));
write(search(new int[]{1, 3, 5, 7}, 0));
write(search(new real[]{1, 3, 5, 7}, 7));
write(find(new bool[]{false, true, true}));
write(find(new int[]{2,4,6} == 4));
write(find(new bool[]{false, false}));
wi(findall(new bool[]{true, false, true}));
wi(concat(new int[]{1,2}, new int[]{3}));
wr(map(new real(real x) {return x^2;}, new real[]{1, 2, 3}));
int[] e = {10, 20, 30, 40, 50};
wi(e[1:3]);
wi(e[:2]);
wi(e[3:]);
wi(e[:]);
wi(new int[]{1,2,3} + new int[]{10,20,30});
wi(2*new int[]{1,2,3});
wr(new real[]{1,2,3}/2);
wr(new int[]{1,2,3}/2);
wb(new int[]{1,2,3} == new int[]{1,5,3});
write(all(new int[]{1,2,3} == new int[]{1,2,3}));
wi(-new int[]{1,-2});
wi(new int[]{1,2,3} * new int[]{4,5,6});
wb(new int[]{1,2,3} > 1);
wr(new real[]{1,2} + 0.5);
wp(new pair[]{(1,0),(0,1)} * 2);
wp(new pair[]{(1,0),(0,1)} + (1,1));
int[][] m = {{1,2},{3,4}};
wi2(m);
write(m[1][0]);
write(m.length);
write(m[0].length);
wi2(transpose(m));
wr2(identity(3));
wr2(new real[][]{{1,2},{3,4}} * new real[][]{{0,1},{1,0}});
wr(new real[][]{{1,2},{3,4}} * new real[]{1,1});
write(determinant(new real[][]{{1,2},{3,4}}));
wr2(inverse(new real[][]{{2,0},{0,4}}));
wr(solve(new real[][]{{2,1},{1,3}}, new real[]{3,5}));
int[] cy = {1,2,3};
cy.cyclic = true;
write(cy[5]);
write(cy[-1]);
write(cy.cyclic);
pair[] pts = {(0,0), (1,2), (3,1)};
wp(pts);
write(sum(pts));
write(pts.length);
string[] strs = {"x", "yy"};
ws(strs);
real[] em;
write(em.length);
int[] big = new int[4];
write(big.length);
write(big.initialized(0));
int[] g;
g[0] = 5;
wi(g);
g[3] = 7;
write(g.length);
write(g.initialized(2));
write(array(3, new int[]{1}).length);
wi(sequence(0));
wi(reverse(4));
write(max(new real[]{-5, -2, -9}));
write(dot(new real[]{1,2,3}, new real[]{4,5,6}));
wr(abs(new real[]{-1, 2}));
wr(uniform(0, 1, 5));
write(minbound(new pair[]{(0,1),(2,-1)}));
write(maxbound(new pair[]{(0,1),(2,-1)}));
//ASYERR wi(new int[]{4,5,6}.keys);
wi2(sort(new int[][]{{2,1},{1,5},{1,2}}));
write(pts[1].x);
for (int x : new int[]{7,8}) {
  write(x);
}
for (pair pp : pts) {
  write(pp);
}
int[] h = {1,2,3,4,5,6};
wi(h[sequence(0,2)]);
wr(sequence(4) * 0.5);
int[] fill;
for (int i = 0; i < 4; ++i) { fill.push(i*i); }
wi(fill);
write(fill[fill.length-1]);
//ASYERR wr(new real[]{3,1,2}[1:]);
real[] rr = {0.5, 1.5};
rr[1] += 1;
wr(rr);
rr.push(9);
write(rr.length);
wi(max(new int[]{1,5,2}, new int[]{4,0,3}));
write(max(new int[][]{{1,9},{3}}));
wi(sort(new int[]{3,1,2}, new bool(int a, int b) {return a > b;}));
string[] sp = split("a,b,,c", ",");
ws(sp);
write(sp.length);
