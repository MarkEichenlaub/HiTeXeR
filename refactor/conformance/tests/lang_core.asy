// language core: precedence, literals, compound assignment, calls, structs
write(false && true | true);
write(true | false && false);
write(true | true & false);
write(false & false == false);
write(true ^ true | true);
write(-2^2);
write(-3 # 2 * 2);
write(2 + 3 * 4 ^ 2);
write(2.5E+0.1*N);
write(1e3 + 1e-3);
pair z = (1,2);
z += 1;
write(z);
z *= (0,1);
write(z);
real r = 7;
r %= 4;
write(r);
r ^= 2;
write(r);
int n = -7;
n #= 2;
write(n);
write((int)(-2.5));
write((int)2.5);
write(round(-0.5));
write(round(0.5));
write(round(1.5));
write(Floor(-0.5));
write(Ceil(-0.5));
write(Round(-1.5));
int i = 0, j = 0;
for (i = 0, j = 5; i < j; ++i, --j) {}
write(i);
write(j);
int k = 3;
write(++k * 2);
write(k);
while (--k > 0) {}
write(k);
real[] fs = {1, 2};
real twice(real x) { return 2x; }
real thrice(real x) { return 3x; }
typedef real F(real);
F[] f2 = {twice, thrice};
write(f2[1](2));
real apply(real g(real), real x) { return g(x); }
write(apply(twice, 5));
string t(int x) { return "int"; }
string t(real x) { return "real"; }
write(t(3));
write(t(3.0));
write(t(-2));
write(t(7#2));
write(t(7/2));
int cnt(... int[] a) { return a.length; }
write(cnt());
write(cnt(4, 5, 6));
int[] arr = {1, 2, 3, 4};
write(cnt(... arr));
real sum2(real a, real b ... real[] c) { real s = a + b; for (real v : c) s += v; return s; }
write(sum2(1, 2));
write(sum2(1, 2, 3, 4));
void noname(pair, real y) { write(y); }
noname((0,0), 4);
struct A { int v = 3; }
struct B { A a; int w; }
B b = new B;
write(b.a == null);
write(b.a.v);
A a1 = new A, a2 = a1;
write(a1 == a2);
write(a1 != new A);
struct V { real x, y; }
V mk(real x, real y) { V v; v.x = x; v.y = y; return v; }
V operator -(V a) { return mk(-a.x, -a.y); }
V operator +(V a, V b) { return mk(a.x + b.x, a.y + b.y); }
V q = -mk(1, 2);
write(q.y);
q += mk(10, 10);
write(q.x);
write(-(1,2));
struct St { static int total = 1; int id = total; static void bump() { total *= 2; } }
St.bump();
St s1 = new St;
write(s1.id);
St.total = 10;
St s2 = new St;
write(s2.id);
struct Pt {
  pair p;
  void operator init(pair p) { this.p = p; }
  real dist(Pt o) { return abs(p - o.p); }
}
write(Pt((0,0)).dist(Pt((3,4))));
