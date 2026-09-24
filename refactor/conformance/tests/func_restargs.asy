// rest arguments (...)
real sumall(... real[] xs) { real t = 0; for (real x : xs) t += x; return t; }
write(sumall(1, 2, 3.5));
write(sumall());
real mx(real first ... real[] more) { real m = first; for (real v : more) m = max(m, v); return m; }
write(mx(3));
write(mx(3, 7, 5));
write(max(new real[]{1, 4}));
