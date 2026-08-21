// asy 3.11 collections.hashset + Set_T operators
from collections.hashset(T=int) access HashSet_T as HashSet_int;

HashSet_int s = HashSet_int(nullT=-1);
write(s.add(3));
write(s.add(5));
write(s.add(3));
write(s.size());
write(s.contains(3));
write(s.contains(4));
write(s.delete(3));
write(s.delete(3));
write(s.size());
s.add(7);
s.add(5);
s.add(9);
for (int x : s) write(x);
write(s.extract(7));
write(s.extract(42));
write(s.push(11));
write(s.push(11));
write(s.size());
for (int x : s) write(x);

HashSet_int t = HashSet_int(nullT=-1);
t.add(5);
t.add(9);
t.add(13);
// Set_T operators resolve on Set_T-typed values (a HashSet_T casts to its
// Set_T interface; asy won't chain two implicit casts inside operator
// resolution, so the direct `s + t` form does not compile in real asy).
from collections.set(T=int) access Set_T as Set_int;
Set_int A = s;
Set_int B = t;
var u = A + B;
for (int x : u) write(x);
write(u.size());
var d = u - B;
for (int x : d) write(x);
var i = u & B;
for (int x : i) write(x);
var y = A ^ B;
for (int x : y) write(x);
write(A <= u);
write(u <= A);
write(u == A + B);
write(u != A);
