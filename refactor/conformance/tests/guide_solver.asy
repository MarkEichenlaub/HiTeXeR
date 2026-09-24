// Hobby/MetaFont guide solver: joins, tension, curl, directions, explicit
// controls, cycles, repeated knots, and paths embedded in guides.
// ---- printing helpers
// path: node count, then per segment: start, control1, control2 (recovered from
// point() at t=1/3, 2/3 so it needs only point()/length()), then the end node.
void wpath(path g) { int n = length(g); write("len=" + string(n)); for (int i = 0; i < n; ++i) { pair P0 = point(g, i), P3 = point(g, i+1); pair U = 27*point(g, i+1/3) - 8*P0 - P3; pair V = 27*point(g, i+2/3) - P0 - 8*P3; write(P0); write((2*U - V)/18); write((2*V - U)/18); } write(point(g, n)); }
// ---- end helpers
wpath((0,0)--(1,0)..(2,1));
wpath((0,0)..(1,0)--(2,1));
wpath((0,0){up}--(1,0)..(2,1));
wpath((0,0)--(1,0){up}..(2,1));
wpath((0,0)..(1,1){up}--(2,0));
wpath((0,0)..{up}(1,1)--(2,0));
wpath((0,0)..(1,1)..(1,1)..(2,0));
wpath((0,0){curl 2}..(1,1)..(2,0));
wpath((0,0)..{curl 2}(1,1)..(2,0));
wpath((0,0)..(1,1){curl 1}..(2,0));
wpath((0,0){curl 0}..(1,1)..(2,0)..(3,1){curl 0}..(4,0));
wpath((0,0)..{curl 3}(1,1));
wpath((0,0)..tension atleast 1.5 ..(1,1));
wpath((0,0)::(1,0)::(2,1)::(3,1));
wpath((0,0)..controls (1,1) and (2,1)..(3,0)..(4,1));
wpath((0,0)..controls (0,1)..(3,0)..(4,1)..cycle);
wpath((0,0)..controls (1,1) and (2,1)..(3,0)..cycle);
wpath((0,0)..(1,1)..controls (2,2) and (3,2)..(4,0)..cycle);
wpath((0,0){left}..(1,0));
wpath((0,0){1,2}..(1,0));
wpath((0,0){dir(30)}..{dir(-30)}(1,0));
wpath((0,0){dir(45)}..(2,0)..{dir(45)}(4,0));
wpath((0,0)..(1,0){up}..{left}(0,1)..cycle);
wpath((0,0)..(1,0)..{left}cycle);
wpath((0,0){right}..(1,1)..cycle);
wpath((0,0)..(2,0)..(2,3)..(0,2)..cycle);
wpath((0,0)..(2,0)..(2,3){up}..(0,2)..cycle);
wpath((0,0)..(1,0){up}..(1,1)..(0,1)..cycle);
wpath((0,0){up}..(1,0)..(1,1)..(0,1)..cycle);
wpath((0,0)..{up}(1,0){left}..(0,1));
wpath((0,0){up}..{down}(1,0)..(3,0));
wpath((0,0)..(1,1)--(2,0)..cycle);
wpath((0,0)--(1,1)..(2,0)..cycle);
wpath((0,0)..(1,1)..(2,0)--cycle);
wpath((0,0)..(1,1)..(2,0)..(0,0)..cycle);
wpath((0,0)..(1,1)..(2,0)..{up}(0,0)..cycle);
wpath((0,0)..(1,0)..(1,0)..(2,1)..cycle);
wpath((0,0)..tension 2 ..(1,1)..tension 1 and 3 ..(3,0)..(4,2));
wpath((0,0)..tension atleast 1 ..(1,3)..tension atleast 2 ..(3,0)..(4,2));
wpath((0,0)..tension 1.2 and 1.4 ..(1,1)..tension 2 and 1 ..(2,0)..tension atleast 1.1 ..cycle);
wpath((0,0)..(1,1)..tension 1.5 ..cycle);
wpath((0,0)..(1,0)..(1,1)..tension atleast 1 ..cycle);
wpath((0,0)..(3,0)..(3,1)..(0,1)..tension 3 ..cycle);
wpath((0,0)..(1,0)..tension atleast 3 ..(1,1)..(0,1)..cycle);
wpath((0,0)---(1,1)..(2,0)..(3,1)---(4,1));
wpath((0,0)--(1,0)---(2,1)..(3,0));
wpath((0,0)---(1,0)---(1,1)---cycle);
wpath((0,0)..(1,0)::(1,1)..(0,1)..cycle);
wpath((0,0)..(5,0){curl 0.5}..(5,3)..(0,3)..cycle);
wpath((0,0)..tension 0.75 ..(1,1)..(2,0));
wpath((0,0)..(1,2)..(2,-1)..(3,3)..(4,0)..(5,1));
wpath((0,0)..(4,0)..(4.1,0.1)..(0,1));
wpath((0,0)..(1,0)..(0,0.01)..(-1,0));
path p = (0,0)..(1,1)..(2,0);
wpath(p..(3,1)..(4,0));
path s = (0,0)--(1,1);
wpath(s..(2,0)..(3,1));
path q = (2,0)..(3,1)..(4,0);
wpath((0,0)..(1,1)..q);
guide g = (0,0)..(1,1); g = g..(2,0); g = g..(3,1);
wpath(g);
