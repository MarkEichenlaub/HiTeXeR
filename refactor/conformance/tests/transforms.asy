// transforms
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
transform T = shift(1,2);
write(T*(0,0));
write(shift((3,4))*(1,1));
write(scale(2)*(1,3));
write(scale(2,3)*(1,1));
write(xscale(2)*(1,1));
write(yscale(3)*(1,1));
write(rotate(90)*(1,0));
write(rotate(30)*(1,0));
write(rotate(-90)*(1,0));
write(rotate(180, (1,1))*(0,0));
write(reflect((0,0), (1,1))*(1,0));
write(reflect((0,1), (1,1))*(0,0));
write(reflect((0,0), (1,0))*(2,3));
write(slant(1)*(1,1));
write(shift(1,0)*rotate(90)*(1,0));
write(rotate(90)*shift(1,0)*(1,0));
write(scale(2)*shift(1,1)*(0,0));
transform R = rotate(30);
write(inverse(R)*R*(1,2));
write(inverse(shift(1,2))*(0,0));
write(inverse(scale(2))*(4,4));
write(R);
write(shift(1,2));
write(scale(2));
write(identity());
write(shift(1,2)*scale(3));
write(shiftless(shift(1,2)*scale(3)));
write(shift(1,2).x);
write(shift(1,2).y);
write(scale(3).xx);
write(rotate(90).xy);
write(rotate(90).yx);
write(scale(2,5).yy);
wpath(shift(1,1)*((0,0)--(1,0)));
wpath(rotate(90)*((1,0)--(2,0)));
wpath(scale(2)*((0,0)..(1,1)..(2,0)));
wpath(reflect((0,0),(0,1))*((1,0)--(2,1)));
write(rotate(45, (1,0))*(2,0));
write(shift((1,1))*scale(2)*rotate(90)*(1,0));
write(T*T*(0,0));
transform U = T*rotate(90);
write(U*(1,0));
write(U == T);
write(T == shift(1,2));
write(scale(-1)*(1,2));
write(rotate(360)*(1,0));
write(rotate(120)*(1,0));
write(rotate(90)*dir(0));
write(shift(2)*(1,1));
write(shift(2,3)*shift(-2,-3)*(5,5));
write(inverse(rotate(45)*scale(2))*(1,1));
wpath(scale(0.5)*unitsquare);
wpath(rotate(45)*unitsquare);
wpath(slant(0.5)*unitsquare);
wpath(xscale(-1)*((1,0)..(2,1)..(3,0)));
transform refl = reflect((0,0),(1,2));
write(refl*(1,0));
write(refl*refl*(1,0));
write(scale(2)*rotate(90));
write(rotate(90)*scale(2,1));
write(shift(1,0)*reflect((0,0),(0,1)));
write(rotate(60)*(2,0) + (1,1));
write((rotate(90)*(1,1)).x);
transform S = shift(1,1)*rotate(45);
write(S*(1,0));
write(inverse(S)*(S*(3,4)));
pair P = (2,1);
P = rotate(90)*P;
write(P);
wpath(rotate(90, (1,0))*((0,0)--(1,1)));
//ASYERR write(scale(2, (1,1))*(2,2));
