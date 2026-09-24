// control flow, loops, functions, closures, recursion
int s = 0;
for (int i = 0; i < 10; ++i) { s += i; }
write(s);
s = 0;
for (int i = 10; i > 0; i -= 3) { s += i; }
write(s);
int n = 0;
while (n < 5) { ++n; }
write(n);
n = 0;
do { n += 2; } while (n < 7);
write(n);
s = 0;
for (int i = 0; i < 10; ++i) { if (i == 3) continue; if (i == 7) break; s += i; }
write(s);
for (int i = 0; i < 3; ++i) {
  write(i);
}
for (real x = 0; x <= 1; x += 0.25) {
  write(x);
}
for (real x = 0; x < 1; x += 0.1) {
  write(x);
}
int[] arr = {4, 5, 6};
for (int v : arr) {
  write(v);
}
s = 0;
for (int i = 0; i < 3; ++i) { for (int j = 0; j < 3; ++j) { if (j > i) break; s += 10*i + j; } }
write(s);
if (1 > 2) { write("a"); } else if (2 > 1) { write("b"); } else { write("c"); }
real f(real x) { return x^2 + 1; }
write(f(2));
write(f(0.5));
int g(int a, int b = 10) { return a + b; }
write(g(1));
write(g(1, 2));
write(g(b = 5, a = 1));
string t(int x) { return "int"; }
string t(real x) { return "real"; }
string t(pair x) { return "pair"; }
string t(string x) { return "string"; }
write(t(1));
write(t(1.0));
write(t((1,2)));
write(t("a"));
write(t(1/2));
write(t(1#2));
int fact(int k) { return k <= 1 ? 1 : k * fact(k - 1); }
write(fact(10));
int fib(int k) { if (k < 2) return k; return fib(k-1) + fib(k-2); }
write(fib(15));
real apply(real F(real), real x) { return F(x); }
write(apply(f, 3));
write(apply(new real(real x) { return 2*x; }, 3));
typedef real realfn(real);
realfn adder(real c) { return new real(real x) { return x + c; }; }
realfn add5 = adder(5);
write(add5(1));
int counter = 0;
void bump() { ++counter; }
bump(); bump(); bump();
write(counter);
pair mid(pair a, pair b) { return (a + b)/2; }
write(mid((0,0), (3,4)));
void swap(int[] a) { int tmp = a[0]; a[0] = a[1]; a[1] = tmp; }
int[] sw = {1, 2};
swap(sw);
write(sw[0]);
int x = 1;
{ int x = 2; write(x); }
write(x);
real r = 3;
void setr() { r = 4; }
setr();
write(r);
bool flag = false;
if (!flag) flag = true;
write(flag);
int m = 7;
string res = m % 2 == 0 ? "even" : "odd";
write(res);
real q(int a) { return a / 2; }
write(q(3));
int ri(real a) { return (int)a; }
write(ri(2.9));
write(ri(-2.9));
int z = 0;
for (int i = 0; i < 5; ++i) z += i;
write(z);
real[] vals;
for (int i = 1; i <= 4; ++i) vals.push(1/i);
write(vals[3]);
write(vals.length);
//ASYERR static int st = 3;
//ASYERR write(st);
int ii = 3;
real rr = ii;
rr /= 2;
write(rr);
int jj = 7;
jj = jj # 2;
write(jj);
int count3 = 0;
for (int a = 0; a < 3; ++a) for (int b = 0; b < 3; ++b) ++count3;
write(count3);
pair P = (1,1);
P += (2,3);
write(P);
P *= 2;
write(P);
P /= 4;
write(P);
