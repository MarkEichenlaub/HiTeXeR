// circle()/arc() (plain, 4-node Bezier) vs graph.asy Circle()/Arc() (n-node
// Hobby splines), and graph() joins.
import graph;
// ---- printing helpers
void wpath(path g) { int n = length(g); write("len=" + string(n)); for (int i = 0; i < n; ++i) { pair P0 = point(g, i), P3 = point(g, i+1); pair U = 27*point(g, i+1/3) - 8*P0 - P3; pair V = 27*point(g, i+2/3) - P0 - 8*P3; write(P0); write((2*U - V)/18); write((2*V - U)/18); } write(point(g, n)); }
// ---- end helpers
wpath(unitcircle);
wpath(circle((1,-2), 0.5));
wpath(ellipse((1,1), 3, 1));
write(point(circle((0,0), 2), 2.5));
wpath(arc((0,0), 1, 30, 150));
wpath(arc((0,0), 2, 150, 30));
wpath(arc((1,1), 2, 200, 340));
wpath(arc((0,0), 1, 45, 45));
wpath(arc((0,0), 1, 45, 45, CW));
wpath(arc((0,0), 1, 10, 350, CW));
wpath(arc((0,0), 1, 350, 10, CCW));
wpath(arc((0,0), -1, 30, 60));
wpath(arc((0,0), 1, 30, 400));
wpath(arc((1,0), (3,1), (0,2)));
wpath(arc((1,0), (3,1), (0,2), CW));
path C = Circle((1,2), 3);
write(length(C));
write(point(C, 0));
write(point(C, 0.5));
write(point(C, 100));
write(point(C, 250.25));
write(point(C, 399.5));
wpath(Circle((1,2), 3, 3));
wpath(Circle((0,0), 1, 8));
path A = Arc((0,0), 2, 10, 100);
write(length(A));
write(point(A, 200.5));
write(point(A, 400));
wpath(Arc((0,0), 2, 10, 100, 4));
wpath(Arc((0,0), 2, 100, 10, 3));
wpath(Arc((0,0), 2, 10, 100, CW, 3));
wpath(Arc((0,0), (2,0), (0,2), 2));
real f(real x) { return x^2; }
path g1 = graph(f, -1, 1, n=4);
wpath(g1);
path g2 = graph(f, -1, 1, n=4, operator ..);
wpath(g2);
path g3 = graph(f, 0, 2);
write(length(g3));
write(point(g3, 50.5));
real r(real t) { return 1 + t; }
path pg = polargraph(r, 0, pi, 4);
wpath(pg);
path pg2 = polargraph(r, 0, pi);
write(length(pg2));
write(point(pg2, 10.5));
pair[] z = {(0,0), (1,2), (2,1), (3,3)};
wpath(graph(z));
wpath(graph(z, operator ..));
