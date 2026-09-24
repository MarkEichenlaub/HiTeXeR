// structs with operator init constructors
struct Pt {
  real x, y;
  void operator init(real x, real y) { this.x = x; this.y = y; }
}
Pt p = Pt(3, 4);
write(p.x);
write(p.y);
Pt[] pts = {Pt(1,0), Pt(0,2)};
write(pts[1].y);
struct Tri {
  pair A, B, C;
  void operator init(pair A, pair B, pair C) { this.A = A; this.B = B; this.C = C; }
}
Tri T = Tri((0,0), (4,0), (0,3));
write(abs(cross(T.B - T.A, T.C - T.A))/2);
