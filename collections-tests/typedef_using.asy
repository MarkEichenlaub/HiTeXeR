// Type aliases: classic typedef and asy 2.96 `using`
using F = int(int);
F dbl = new int(int x) { return 2*x; };
write(dbl(21));

typedef real rfunc(real);
rfunc sq = new real(real x) { return x*x; };
write(sq(3));
write('types ok');
