// asy 3.11 collections.btreemap: map with sorted-key iteration
from collections.btreemap(K=int, V=string) access BTreeMap_K_V as BMap;

BMap m = BMap(nullValue='');
m[5] = 'five';
m[1] = 'one';
m[9] = 'nine';
m[3] = 'three';
write(m.size());
for (int k : m) write(k);
write(m[3]);
write(m[7]);
m[3] = '';  // assigning nullValue deletes
write(m.contains(3));
write(m.size());
for (int k : m) write(k);
