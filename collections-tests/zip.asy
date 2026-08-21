// asy 3.11 collections.zip / zip2 / enumerate / iter.range
from collections.zip(T=int) access zip;
from collections.iter(T=int) access range;

int[] a = {1, 2, 3};
int[] b = {4, 5, 6};
int[] c = {7, 8, 9, 10};

for (int[] xy : zip(a, b)) write(10*xy[0] + xy[1]);
for (int[] xyz : zip(a, b, c)) write(100*xyz[0] + 10*xyz[1] + xyz[2]);
for (int[] xyz : zip(default=0, a, b, c)) write(100*xyz[0] + 10*xyz[1] + xyz[2]);

var A = range(a);
var B = range(b);
for (int[] xy : zip(A, B)) write(10*xy[0] + xy[1]);

from collections.zip2(K=int, V=string) access zip as zipKV;
from collections.iter(T=string) access range;
string[] names = {'one', 'two', 'three'};
for (var kv : zipKV(range(a), range(names))) { write(kv.k); write(kv.v); }

from collections.enumerate(T=string) access enumerate;
for (var p : enumerate(names)) { write(p.k); write(p.v); }
