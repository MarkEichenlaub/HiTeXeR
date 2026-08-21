// Pre-3.11 template modules (also pass on asy 3.05): mapArray + map
from mapArray(Src=int, Dst=int) access map;
int sq(int x) { return x*x; }
int[] a = {1, 2, 3, 4};
int[] b = map(sq, a);
for (int x : b) write(x);

from map(Key=string, Value=int) access map as SImap;
SImap ages = SImap(0);
ages.add('alice', 30);
ages.add('bob', 25);
write(ages.lookup('alice'));
write(ages.lookup('bob'));
write(ages.lookup('carol'));
