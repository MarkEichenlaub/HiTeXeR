// asy 3.11 collections.hashmap
from collections.hashmap(K=string, V=int) access HashMap_K_V as HashMap_string_int;

HashMap_string_int m = HashMap_string_int(nullValue=-1);
m['alice'] = 3;
m['bob'] = 5;
m['alice'] = 7;
write(m.size());
write(m['alice']);
write(m['bob']);
write(m['carol']);
write(m.contains('bob'));
write(m.contains('dave'));
m.delete('bob');
write(m.size());
for (string k : m) write(k);
m['dave'] = 4;
m['erin'] = 6;
for (string k : m.keys()) write(k);
write(m.empty());
m['erin'] = -1;  // assigning nullValue deletes the key
write(m.contains('erin'));
write(m.size());
for (var kv : m.pairs()) { write(kv.k); write(kv.v); }

// int-keyed, real-valued, no nullValue
from collections.hashmap(K=int, V=real) access HashMap_K_V as HashMap_int_real;
HashMap_int_real w = HashMap_int_real(nullValue=nan, isNullValue=isnan);
w[10] = 0.5;
w[20] = 1.5;
write(w.size());
write(w[10] + w[20]);
write(isnan(w[30]));
w[10] = nan;  // soft delete
write(w.contains(10));
write(w.size());
