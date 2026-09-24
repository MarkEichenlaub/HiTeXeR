int fib(int n) { return n < 2 ? n : fib(n-1) + fib(n-2); }
real f(real x, real y) { return x*y + 1; }
real t = 0;
for (int i = 0; i < 20000; ++i) t = f(t, 0.5);
dot((fib(18) + t, 0));
