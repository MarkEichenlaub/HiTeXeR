// implicit/explicit conversions and typical AoPS numeric idioms
pair z = 3;
write(z);
pair w = 2.5;
write(w);
real r = 7;
write(r);
real h = 1/2;
write(h);
int i = 7;
write(i/2*2);
write(i#2*2);
write(1/2*4);
write(2*3/4);
write(3/4*(1,2));
write((1,2)/4);
write((1,2)*(1/3));
write(sqrt(3)/2*(2,0));
write(i + 0.5);
write(i*(0.5,0.5));
write((int)(7/2));
write((int)(2.999999));
write((real)3/4);
write((pair)(2));
write(xpart(z) + ypart(z));
write(-(1,2));
write((1,2) - 1);
write(1 - (1,2));
write((2,4) / 2.0);
write(10 % 3 + 10 # 3);
write(-10 % 3);
write(-10 # 3);
write(10.5 % 3);
write(-1 % 5);
for (int k = 0; k < 6; ++k) {
  write((k % 3, k # 3));
}
for (int k = -3; k <= 3; ++k) {
  write(k % 2);
}
for (int k = 0; k < 4; ++k) {
  write(dir(90*k));
}
for (int k = 0; k < 5; ++k) {
  write(dir(90 + 72*k));
}
for (int k = 0; k < 6; ++k) {
  write(2*dir(60*k));
}
write(dir(45)*sqrt(2));
write(2*dir(30) + (1,0));
write(rotate(72)*(0,1));
write((1,0)*dir(120));
write(abs((3,4)*I));
real a = 3, b = 4;
write(sqrt(a^2 + b^2));
write(a/b);
write(atan(b/a));
write(degrees(atan2(b, a)));
write(aCos(a/5));
write(180/7);
write(360/7);
write(360.0/7);
write(1/3 + 1/3 + 1/3);
write(0.1*3);
write(1e-17 + 1);
write(2^52 + 1);
write(2^62);
write(3^20);
write(-7 / 2);
write(7 / -2);
write(0 / 5);
write(5 # 1);
write(abs(-2^31));
write(round(1e10 + 0.4));
write(round(-0.4));
write(floor(-0.5));
write(ceil(-0.5));
//ASYERR write(1/0.0 > 1e308);
