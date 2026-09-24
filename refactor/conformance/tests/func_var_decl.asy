// function-typed variable declared with a signature and initialized with a lambda
real sq(real x) = new real(real x) { return x*x; };
write(sq(1.5));
