pair[] pts;
for (int i = 0; i < 4000; ++i) {
  pair p = dir(i * 0.7) * (1 + i / 4000);
  pts.push(p);
}
pair c = (0,0);
for (int k = 0; k < 10; ++k)
  for (int i = 0; i < pts.length; ++i) c += pts[i] / pts.length;
dot(c);
draw(pts[0]--pts[1]--pts[2]);
