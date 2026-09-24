// user-defined operators
struct V { real x, y; }
V mkv(real x, real y) { V v = new V; v.x = x; v.y = y; return v; }
V operator +(V a, V b) { return mkv(a.x + b.x, a.y + b.y); }
V operator *(real k, V a) { return mkv(k*a.x, k*a.y); }
bool operator ==(V a, V b) { return a.x == b.x && a.y == b.y; }
V q = mkv(1, 2) + mkv(3, 4);
write(q.x);
write(q.y);
write((2*q).y);
write(mkv(1,2) == mkv(1,2));
write(mkv(1,2) == mkv(1,3));
real operator ^(pair a, pair b) { return a.x*b.y - a.y*b.x; }
write((1,0) ^ (0,1));
write((1,1)*2);
