// asy 3.11 native hashing: property tests only — hash VALUES are salted
// per-process in real asy, so only the documented invariants are portable.
int x = 3;
assert(x.hash() >= 0);
int three = 3;
assert(x.hash() == three.hash());
int four = 4;
assert(x.hash() != four.hash());
string s = 'hello';
assert(s.hash() >= 0);
string hello = 'hello';
assert(s.hash() == hello.hash());
string world = 'world';
assert(s.hash() != world.hash());
real ONE = 1.0;
assert(ONE.hash() >= 0);
int[] arr = {1, 2, 3};
int[] arr2 = {1, 2, 3};
int[] arr3 = {1, 2, 4};
assert(hash(arr) >= 0);
assert(hash(arr) == hash(arr2));
assert(hash(arr) != hash(arr3));
write('hash ok');
