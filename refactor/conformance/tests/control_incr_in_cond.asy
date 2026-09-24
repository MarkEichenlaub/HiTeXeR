// prefix ++/-- used inside a condition expression
int k = 0;
while (true) { if (++k > 4) break; }
write(k);
int j = 10;
while (--j > 5) { }
write(j);
int m = 0;
if (++m == 1) { write("one"); }
write(m);
