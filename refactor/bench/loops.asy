real s = 0;
for (int i = 0; i < 300; ++i) {
  for (int j = 0; j < 300; ++j) {
    s += (i * j) % 7 + sqrt(i + j);
    if (s > 1e9) s = 0;
  }
}
dot((s/1e6, 0));
