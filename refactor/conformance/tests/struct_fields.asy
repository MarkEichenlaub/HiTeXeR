// structs: fields, new, references, arrays of structs (no methods)
struct Seg { pair a, b; }
Seg s = new Seg;
s.a = (0,0);
s.b = (6,8);
write(abs(s.b - s.a));
write((s.a + s.b)/2);
Seg s2 = s;
s2.a = (1,1);
write(s.a);
Seg s3;
write(s3 == null);
Seg[] segs;
for (int i = 0; i < 3; ++i) { Seg t = new Seg; t.a = (i, 0); t.b = (i, i + 1); segs.push(t); }
write(segs.length);
write(abs(segs[2].b - segs[2].a));
struct Node { int v; Node next; }
Node a = new Node; a.v = 1;
Node b = new Node; b.v = 2; a.next = b;
write(a.next.v);
write(b.next == null);
struct Def { int a = 5; real b = a * 2; pair p = (1,2); }
Def d = new Def;
write(d.a);
write(d.b);
write(d.p);
d.a = 9;
write(d.b);
struct Counter { int n = 0; }
Counter c = new Counter;
++c.n; c.n += 5;
write(c.n);
real len(Seg q) { return abs(q.b - q.a); }
write(len(s));
Seg mk(pair a, pair b) { Seg r = new Seg; r.a = a; r.b = b; return r; }
write(len(mk((0,0), (3,4))));
Seg[] arr = {mk((0,0),(1,0)), mk((0,0),(0,2))};
write(len(arr[1]));
