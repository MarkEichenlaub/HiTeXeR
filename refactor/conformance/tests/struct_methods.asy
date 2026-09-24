// structs with member functions
struct Pt {
  real x, y;
  real norm() { return sqrt(x^2 + y^2); }
  void scaleby(real k) { x *= k; y *= k; }
  pair topair() { return (x, y); }
}
Pt p = new Pt;
p.x = 3; p.y = 4;
write(p.norm());
p.scaleby(2);
write(p.x);
write(p.topair());
struct Counter {
  int n = 0;
  void inc() { ++n; }
  int get() { return n; }
}
Counter c = new Counter;
c.inc(); c.inc();
write(c.get());
Counter c2 = c;
c2.inc();
write(c.n);
