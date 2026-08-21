// asy 3.11 collections.splaytree (SortedSet_T interface)
from collections.splaytree(T=int) access SplayTree_T as Splay_int;

bool intLess(int a, int b) { return a < b; }
Splay_int s = Splay_int(intLess, -1);
s.add(5);
s.add(1);
s.add(9);
s.add(3);
s.add(1);
write(s.size());
for (int x : s) write(x);
write(s.min());
write(s.max());
write(s.after(3));
write(s.before(3));
write(s.atOrAfter(3));
write(s.atOrBefore(4));
write(s.after(9));
write(s.popMin());
write(s.popMax());
write(s.size());
for (int x : s) write(x);
write(s.contains(5));
write(s.contains(9));
