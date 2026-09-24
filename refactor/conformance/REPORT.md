# HiTeXeR language/library conformance report

Generated 2026-09-24T18:28:15.713Z by `node refactor/conformance/build-report.js` from the results of
`node refactor/conformance/run.js` (write() output diff against real Asymptote 3.06) and
`node refactor/conformance/colors-check.js`.

Interpreter under test: `refactor/conformance/.snapshot/7f7c84cf/asy-interp.js` (git HEAD at the time of the run; the working-tree asy-interp.js was
being edited concurrently and at one point failed to load; a later `--working` run against it gave identical totals).
Line numbers below (Lnnnn) refer to the HEAD snapshot.

**45 test files, 1370 write() checks: 483 real mismatches (149 of them "HiTeXeR printed nothing"), 109 numerical-noise mismatches (agree to 1e-9), 8 format-only.**

Corpus counts are the number of diagrams in comparison/asy_src (13,002 files) that call the construct
(`corpus-counts.json`). Categories are ordered by the most-used construct in each.

## Summary by root cause

| # | Root cause | real mismatches (+noise/format) | most-used constructs (corpus files) |
|---|---|---|---|
| 1 | [circle()/Circle()/arc()/Arc()/ellipse() construction and parameterization](#circlearc) | 41 (+0) | Circle 2036, arc 1700, circle 903, circumcircle 668, incircle 169, Arc 102, ellipse 57, CR 4, point(circle 82 |
| 2 | [graph module: graph(), Circle/Arc sampling, interpolation](#graph) | 16 (+2) | graph 1161, Circle 2036, Arc 102, polargraph 32 |
| 3 | [Built-in constants and misc builtins](#constants) | 18 (+6) | Npt 1573, Degrees 0, hypot 2 |
| 4 | [extension() of parallel lines (non-parallel extension() is exact)](#extension) | 1 (+1) | extension 1449 |
| 5 | [Path intersections are only accurate to ~1e-4](#intersect) | 52 (+0) | intersectionpoint 670, intersectionpoints 825, IP 20, IPs 61, intersect 14, buildcycle 51 |
| 6 | [Strings: string()/format() number formatting and string functions](#strings) | 23 (+9) | string 622, format( 21, string(real,n) 0 |
| 7 | [geometry.asy module (point/line/circle/triangle structs)](#geometry) | 7 (+0) | import geometry 339 |
| 8 | [Operators: bool ^, compound #= %= ^=, prefix --](#operators) | 7 (+0) | # 14, % 295 |
| 9 | [Path queries: subpath/reverse edge cases, missing path builtins](#subpath) | 44 (+9) | point 226, reverse 143, subpath 13, inside 4, windingnumber 0, beginpoint 0, endpoint 0, precontrol 0 |
| 10 | [Pair functions](#pairs) | 6 (+4) | cross 201, minbound 0, maxbound 0, abs2 0 |
| 11 | [Arclength-based functions: arclength, arctime, relpoint, reltime, midpoint, waypoint](#arclen) | 25 (+3) | midpoint 186, relpoint 165, arclength 96, arctime 0, reltime 2, waypoint 10, WP 0 |
| 12 | [Integer casts, rounding, int/real distinction](#casts) | 23 (+4) | round 6, floor 50, ceil 2, (int) 182, pair=number 3 |
| 13 | [Arrays: methods, whole-array arithmetic, sort/search, matrix ops](#arrays) | 34 (+0) | array append/insert/delete 11, sort 2, reverse 143, search 0, concat 0 |
| 14 | [min()/max() of paths and pictures return 0](#minmax) | 20 (+0) | min/max(ident) 142 |
| 15 | [olympiad.asy helpers](#olympiad) | 8 (+3) | anglemark 134, tangent 35, collinear 0, cyclic 1, concurrent 0 |
| 16 | [Parse errors: constructs HiTeXeR cannot parse (whole program aborts)](#syntax) | 34 (+0) | struct 6, operator 125, tension 3, :: 4, curl 1, for comma 0, rest args 1 |
| 17 | [Path construction: Hobby spline solver, tension, direction specifiers, ---](#hobby) | 11 (+0) | ..cycle 67, --- 27, tension 3, {dir} 17, curl 1, controls 4 |
| 18 | [Pens: attribute getters and color functions](#pens) | 64 (+0) | pen getter 3, cmyk 1, colors 22 |
| 19 | [cse5.asy helpers](#cse5) | 5 (+0) | CR 4, IP 20, CP 0, OP 0, WP 0, L 8, d 20 |
| 20 | [dir(path, t) / dir(path)](#dirpath) | 8 (+5) | dir(path,t) 11 |
| 21 | [Structs](#structs) | 10 (+0) | struct 6, struct method 4 |
| 22 | [transform values: inverse, ==, field access, shiftless](#transform) | 14 (+5) | inverse 1, shiftless 0 |
| 23 | [write() output format (debug-only; affects nothing drawn)](#write) | 12 (+2) | write( 5 |
| 24 | [Numerical noise (agrees to 1e-9 but not to the last digit)](#epsilon) | 0 (+64) |  |

## Constructs where HiTeXeR throws or returns nothing but asy works

### Whole-program parse/runtime errors

| test file | HiTeXeR error | construct |
|---|---|---|
| control_for_comma.asy | Error: Parse error line 4: expected ), got , ',' | `write(z);` |
| control_incr_in_cond.asy | Error: Loop iteration limit exceeded | `write(k);` |
| func_restargs.asy | Error: Parse error line 3: expected IDENT, got ... '...' | `write(sumall(1, 2, 3.5));` |
| func_var_decl.asy | Error: Parse error line 3: expected ), got IDENT 'x' | `write(sq(1.5));` |
| operator_overload.asy | Error: Parse error line 5: expected ), got IDENT 'a' | `write(q.x);` |
| path_syntax_01.asy | Error: Parse error line 16: expected .., got NUMBER '1.5' | `wpath((0,0)..tension atleast 1.5..(1,1));` |
| path_syntax_02.asy | Error: Parse error line 16: expected .., got NUMBER '3' | `wpath((0,0)..tension 1 and 3 ..(2,1));` |
| path_syntax_03.asy | Error: Parse error line 16: expected ), got : ':' | `wpath((0,0)::(1,1)::(2,0));` |
| path_syntax_04.asy | Error: Parse error line 16: expected ), got { '{' | `wpath((0,0){curl 0}..(1,1)..{curl 0}(2,0));` |
| path_syntax_05.asy | Error: Parse error line 16: expected ), got { '{' | `wpath((0,0){curl 2}..(1,1)..(2,0));` |
| path_syntax_11.asy | Error: Parse error line 16: expected ), got { '{' | `wpath((0,0){curl 0}..(1,1));` |
| path_syntax_12.asy | Error: Parse error line 16: expected ), got { '{' | `wpath((0,0)..(1,1){curl 1}..(2,0));` |
| path_syntax_13.asy | Error: Parse error line 16: expected ), got : ':' | `wpath((0,0)::(1,0)::(2,1)::(3,1));` |
| path_syntax_14.asy | Error: Parse error line 16: expected ), got : ':' | `wpath((0,0){down}::(1,-1)::{up}(2,0));` |
| struct_init.asy | Error: unexpected } | `write(p.x);` |
| struct_static.asy | Error: unexpected } | `write(Stat.count);` |

### Unimplemented builtins (HiTeXeR logs `[HTX-unknown-call]` and returns null)

| function | corpus files | where tested |
|---|---|---|
| `colors` | 22 | pens.asy:24 |
| `d` | 20 | mod_cse5.asy:17 |
| `Floor` | 12 | arith_int_real.asy:88 |
| `L` | 8 | mod_cse5.asy:22 |
| `uniform` | 4 | arrays.asy:124 |
| `hypot` | 2 | math_funcs.asy:54 |
| `solve` | 2 | arrays.asy:95 |
| `cyclic` | 1 | circles_arcs.asy:61, mod_olympiad.asy:38, path_basic.asy:18 |
| `downcase` | 1 | strings.asy:47 |
| `erase` | 1 | strings.asy:46 |
| `insert` | 1 | strings.asy:45 |
| `inverse` | 1 | arrays.asy:94, transforms.asy:34 |
| `radius` | 1 | path_basic.asy:104, path_curves.asy:63 |
| `abs2` | 0 | pairs.asy:15 |
| `accel` | 0 | path_basic.asy:103, path_curves.asy:62 |
| `all` | 0 | arrays.asy:77 |
| `arctime` | 0 | circles_arcs.asy:71, path_basic.asy:27, path_curves.asy:26, path_ops.asy:66 |
| `beginpoint` | 0 | path_basic.asy:35 |
| `Ceil` | 0 | arith_int_real.asy:89 |
| `collinear` | 0 | mod_olympiad.asy:40 |
| `colorspace` | 0 | pens.asy:53 |
| `commonpoints` | 0 | mod_cse5.asy:31 |
| `concat` | 0 | arrays.asy:65 |
| `concurrent` | 0 | mod_olympiad.asy:42 |
| `CP` | 0 | mod_cse5.asy:21 |
| `determinant` | 0 | arrays.asy:93 |
| `dirtime` | 0 | path_basic.asy:105, path_curves.asy:68 |
| `endpoint` | 0 | circles_arcs.asy:29, path_basic.asy:36 |
| `erf` | 0 | math_funcs.asy:68 |
| `expm1` | 0 | math_funcs.asy:13 |
| `fabs` | 0 | math_funcs.asy:51 |
| `findall` | 0 | arrays.asy:64 |
| `Jn` | 0 | math_funcs.asy:82 |
| `linejoin` | 0 | pens.asy:74 |
| `log1p` | 0 | math_funcs.asy:12 |
| `maxbound` | 0 | arrays.asy:126, pairs.asy:56 |
| `maxtimes` | 0 | path_curves.asy:73 |
| `minbound` | 0 | arrays.asy:125, pairs.asy:55 |
| `mintimes` | 0 | path_curves.asy:72 |
| `OP` | 0 | mod_cse5.asy:28 |
| `piecewisestraight` | 0 | path_basic.asy:86 |
| `postcontrol` | 0 | path_basic.asy:46, path_curves.asy:18 |
| `precontrol` | 0 | path_basic.asy:45, path_curves.asy:17 |
| `rfind` | 0 | strings.asy:42 |
| `Round` | 0 | arith_int_real.asy:90 |
| `search` | 0 | arrays.asy:58 |
| `shiftless` | 0 | transforms.asy:42 |
| `straight` | 0 | path_basic.asy:84 |
| `stripsuffix` | 0 | strings.asy:68 |
| `upcase` | 0 | strings.asy:48 |
| `windingnumber` | 0 | circles_arcs.asy:64, path_basic.asy:97 |
| `WP` | 0 | mod_cse5.asy:29 |
| `Yn` | 0 | math_funcs.asy:83 |

### Returns nothing without a diagnostic

Many of these are repeat calls of a builtin listed above (HiTeXeR warns once per name). The rest (size(path), struct methods and field initializers, transform fields, geometry-module fields, arrowlength/labelmargin) fail silently.

| file:line | source | asy |
|---|---|---|
| arith_int_real.asy:91 | `write(Floor(-2.7));` | `-3` |
| arrays.asy:59 | `write(search(new int[]{1, 3, 5, 7}, 0));` | `-1` |
| arrays.asy:60 | `write(search(new real[]{1, 3, 5, 7}, 7));` | `3` |
| arrays.asy:122 | `write(dot(new real[]{1,2,3}, new real[]{4,5,6}));` | `32` |
| circles_arcs.asy:60 | `write(size(circle((0,0), 1)));` | `4` |
| circles_arcs.asy:62 | `write(cyclic(arc((0,0), 1, 0, 360)));` | `false` |
| circles_arcs.asy:72 | `write(arctime(circle((0,0),2), pi));` | `0.999866990818271` |
| intersections.asy:60 | `write(intersections(sq, (-1,1), (1,0))[0]);` | `0.5` |
| misc_builtins.asy:58 | `write(arrowlength);` | `21.259842519685` |
| misc_builtins.asy:59 | `write(arrowangle);` | `15` |
| misc_builtins.asy:73 | `write(labelmargin);` | `0.28` |
| misc_builtins.asy:74 | `write(legendmargin);` | `10` |
| mod_cse5.asy:18 | `write(d(A, C));` | `3.16227766016838` |
| mod_cse5.asy:30 | `write(WP(A--B--C, 0.25));` | `(2.06066017177982,0)` |
| mod_geometry.asy:9 | `write(circumcircle(t).r);` | `2.23606797749979` |
| mod_geometry.asy:10 | `write(incircle(t).r);` | `1.05217763377095` |
| mod_geometry.asy:17 | `write(c.r);` | `2` |
| mod_geometry.asy:25 | `write(t.a());` | `4.24264068711928` |
| mod_geometry.asy:26 | `write(t.b());` | `3.16227766016838` |
| mod_geometry.asy:27 | `write(t.c());` | `4` |
| mod_geometry.asy:34 | `write(t.alpha());` | `71.565051177078` |
| mod_olympiad.asy:39 | `write(cyclic((1,0), (0,1), (-1,0), (0,-2)));` | `false` |
| mod_olympiad.asy:41 | `write(collinear((0,0), (1,1), (3,3.1)));` | `false` |
| path_basic.asy:17 | `write(size(p));` | `3` |
| path_basic.asy:28 | `write(arctime(p, 2));` | `0.5` |
| path_basic.asy:29 | `write(arctime(p, 100));` | `2` |
| path_basic.asy:47 | `write(precontrol(p, 0));` | `(0,0)` |
| path_basic.asy:48 | `write(postcontrol(p, 0.5));` | `(2.66666666666667,0)` |
| path_basic.asy:53 | `write(size(q));` | `4` |
| path_basic.asy:54 | `write(cyclic(q));` | `true` |
| path_basic.asy:72 | `write(size(pp));` | `1` |
| path_basic.asy:76 | `write(size(e));` | `0` |
| path_basic.asy:85 | `write(straight((0,0)..(1,1)..(2,0), 0));` | `false` |
| path_basic.asy:87 | `write(piecewisestraight((0,0)..(1,1)));` | `true` |
| path_basic.asy:96 | `write(size(pa));` | `4` |
| path_basic.asy:98 | `write(windingnumber(q, (2,2)));` | `0` |
| path_basic.asy:99 | `write(windingnumber(reverse(q), (0.5,0.5)));` | `-1` |
| path_basic.asy:106 | `write(cyclic((0,0)--(1,0)--cycle));` | `true` |
| path_basic.asy:113 | `write(arctime(q, 2.5));` | `2.5` |
| path_curves.asy:19 | `write(postcontrol(c, 0));` | `(1.11022302462516e-16,0.552284749830793)` |
| path_curves.asy:20 | `write(precontrol(c, 2));` | `(2,0.552284749830793)` |
| path_curves.asy:59 | `write(arctime(s, 2.5));` | `1.10088985404615` |
| path_curves.asy:69 | `write(dirtime(s, (0,-1)));` | `2.76340106451067` |
| pens.asy:54 | `write(colorspace(gray(0.3)));` | `gray` |
| pens.asy:55 | `write(colorspace(cmyk(red)));` | `cmyk` |
| struct_fields.asy:24 | `write(d.a);` | `5` |
| struct_fields.asy:25 | `write(d.b);` | `10` |
| struct_fields.asy:26 | `write(d.p);` | `(1,2)` |
| struct_fields.asy:28 | `write(d.b);` | `10` |
| struct_methods.asy:10 | `write(p.norm());` | `5` |
| struct_methods.asy:13 | `write(p.topair());` | `(6,8)` |
| struct_methods.asy:21 | `write(c.get());` | `2` |
| struct_methods.asy:24 | `write(c.n);` | `3` |
| transforms.asy:43 | `write(shift(1,2).x);` | `1` |
| transforms.asy:44 | `write(shift(1,2).y);` | `2` |
| transforms.asy:45 | `write(scale(3).xx);` | `3` |
| transforms.asy:46 | `write(rotate(90).xy);` | `-1` |
| transforms.asy:47 | `write(rotate(90).yx);` | `1` |
| transforms.asy:48 | `write(scale(2,5).yy);` | `5` |

## Mismatches by root cause

<a id="circlearc"></a>
### 1. circle()/Circle()/arc()/Arc()/ellipse() construction and parameterization

Corpus usage: `Circle` 2036, `arc` 1700, `circle` 903, `circumcircle` 668, `incircle` 169, `Arc` 102, `ellipse` 57, `CR` 4, `point(circle` 82.

**Likely cause.** (1) plain circle(c,r) (L9973) and graph's Circle(c,r[,n]) (L9979) both call makeCirclePath (L26976), which builds asy's 4-segment Bezier circle but tags it `_circle` with a virtual 400-node parameterization, and _pointOnPath (L10421) then maps point(g,t) to angle t/400*360deg. That is right for graph's Circle (asy: length 400, a 400-node `..` polygon) but wrong for plain circle(): point(circle((1,2),3),1.5) should be on the 4-node Bezier at t=1.5 ((-1.121,4.121)), not 1.35deg past the start. Meanwhile length() still returns 4 for both, so length(Circle(...)), length(circumcircle(...)) (olympiad uses graph's Circle) and point(C, length(C)/2) disagree with asy. Circle(c,r,n) ignores n. (2) The Bezier kappa is truncated: `K = 0.5522847498` (L9280 unitcircle, L4704, L20654, L26977) vs asy's 0.552284749830793 (4/3*(sqrt(2)-1)), which shows up as 1e-11 errors in every circle point. (3) arc(c,r,a1,a2) (L9985 -> makeArcPath L26993) builds its own Bezier; asy builds arcs as a subpath of the 4-node unit circle at arctime-derived times, so asy's arc(0,90) has length 2 (a real quarter plus a degenerate zero-length tail segment) and interior arcs start/end on the *Bezier* circle, e.g. arc((0,0),1,30,150) starts at (0.866169630634359,0.500083269410626), HiTeXeR (0.863470685147584,0.504719148072945) which is also not the exact dir(30). Node count / times differ for every arc, so point(arc,t), relpoint and dir(arc,t) mismatch. arc(c,r,45,45) should be a full circle (asy) but is empty; arc(...,CW) and the 3-point arc(c,A,B) forms follow the same construction. graph's Arc(c,r,a1,a2[,n]) (L10304) returns a 1-segment Bezier (asy: n=400 segments of a `..` polygon; Arc(...,3) = 3 segments).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| circles_arcs.asy:19 | `write(arclength(unitcircle));` | `6.28406679229544` | `6.28153984748023` | value |
| circles_arcs.asy:20 | `wpath(circle((1,2), 3));` | `len=4 / (4,2) / (4,3.65685424949238) / (2.65685424949238,5) / (1,5) / (-0.65685424949238,5) / (-2,3.6568542494 ...` | `len=4 / (4,2) / (4.0000000005637,2.01570796327149) / (3.99987662797204,2.03141592652527) / (3.99962989744498,2 ...` | value |
| circles_arcs.asy:21 | `write(point(circle((1,2), 3), 1.5));` | `(-1.12132034355964,4.12132034355964)` | `(3.999167290654,2.07067929450083)` | value |
| circles_arcs.asy:22 | `write(arclength(circle((0,0), 2)));` | `12.5681335845909` | `12.5630796949605` | value |
| circles_arcs.asy:25 | `wpath(arc((0,0), 1, 0, 90));` | `len=2 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-2.45263698164597e-16,1) / (-4.905273 ...` | `len=1 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1)` | value |
| circles_arcs.asy:26 | `write(length(arc((0,0), 1, 0, 90)));` | `2` | `1` | value |
| circles_arcs.asy:27 | `write(arclength(arc((0,0), 1, 0, 90)));` | `1.57101669807386` | `1.57038496188343` | value |
| circles_arcs.asy:29 | `write(endpoint(arc((0,0), 2, 0, 90)));` | `(-1.47158218898758e-15,2)` | `` | missing |
| circles_arcs.asy:30 | `wpath(arc((0,0), 1, 90, 0));` | `len=2 / (-6.66133814775094e-16,1) / (-4.44089209850063e-16,1) / (-2.22044604925031e-16,1) / (0,1) / (0.5522847 ...` | `len=1 / (0,1) / (0.552284749830794,1) / (1,0.552284749830794) / (1,0)` | value |
| circles_arcs.asy:35 | `wpath(arc((0,0), 1, 30, 150));` | `len=2 / (0.866169630634359,0.500083269410626) / (0.6932530716149,0.798938033457256) / (0.370106805057161,0.999 ...` | `len=2 / (0.863470685147584,0.504719148072945) / (0.689904333258131,0.801015444369242) / (0.368189833220529,1)  ...` | value |
| circles_arcs.asy:36 | `wpath(arc((1,1), 2, 200, 340));` | `len=2 / (-0.879896714441805,0.315773552448351) / (-0.600442669548219,-0.451835104887175) / (0.135763279562424, ...` | `len=2 / (-0.874874949206548,0.302135208641281) / (-0.591703036920055,-0.458319820782935) / (0.140890389152099, ...` | value |
| circles_arcs.asy:40 | `wpath(arc((0,0), (1,0), (0,1)));` | `len=2 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-2.45263698164597e-16,1) / (-4.905273 ...` | `len=1 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1)` | value |
| circles_arcs.asy:42 | `wpath(arc((0,0), (2,0), (0,1)));` | `len=2 / (2,0) / (2,1.10456949966159) / (1.10456949966159,2) / (0,2) / (-4.90527396329193e-16,2) / (-9.81054792 ...` | `len=1 / (2,0) / (2,1.10456949966159) / (1.10456949966159,2) / (0,2)` | value |
| circles_arcs.asy:44 | `wpath(arc((0,0), 1, 0, 10));` | `len=1 / (1,0) / (1,0.0592364764765686) / (0.994849442728453,0.117269975845119) / (0.984971734298905,0.17367709 ...` | `len=1 / (1,0) / (1,0.0613649722034215) / (0.994472651232478,0.121438962929539) / (0.983888661174127,0.17975126 ...` | value |
| circles_arcs.asy:49 | `write(arclength(ellipse((0,0), 2, 1)));` | `9.68983198640407` | `9.68588854833015` | value |
| circles_arcs.asy:51 | `wpath(circle((0,0), 0.5));` | `len=4 / (0.5,0) / (0.5,0.276142374915397) / (0.276142374915397,0.5) / (0,0.5) / (-0.276142374915397,0.5) / (-0 ...` | `len=4 / (0.5,0) / (0.500000000093949,0.0026179938785818) / (0.49997943799534,0.00523598775421205) / (0.4999383 ...` | value |
| circles_arcs.asy:60 | `write(size(circle((0,0), 1)));` | `4` | `` | missing |
| circles_arcs.asy:61 | `write(cyclic(circle((0,0), 1)));` | `true` | `` | missing |
| circles_arcs.asy:62 | `write(cyclic(arc((0,0), 1, 0, 360)));` | `false` | `` | missing |
| circles_arcs.asy:64 | `write(windingnumber(circle((0,0), 1), (0.5, 0)));` | `1` | `` | missing |
| circles_arcs.asy:70 | `wpath(rotate(90)*arc((0,0),1,0,90));` | `len=2 / (6.12323399573677e-17,1) / (-0.552284749830793,1) / (-1,0.552284749830794) / (-1,6.12323399573677e-17) ...` | `len=1 / (6.12323399573677e-17,1) / (-0.552284749830793,1) / (-1,0.552284749830794) / (-1,6.12323399573677e-17)` | value |
| circles_arcs.asy:71 | `write(arctime(unitcircle, pi/2));` | `0.999866990818271` | `` | missing |
| circles_arcs.asy:72 | `write(arctime(circle((0,0),2), pi));` | `0.999866990818271` | `` | missing |
| circles_arcs.asy:73 | `write(reltime(unitcircle, 0.3));` | `1.19532577752826` | `1.2` | value |
| circles_arcs.asy:77 | `wpath(arc((0,0), 1, 350, 10));` | `len=4 / (0.984971734298905,-0.173677091992108) / (0.902755718499729,-0.6431754969515) / (0.493048273354224,-0. ...` | `len=4 / (0.983888661174128,-0.179751264701663) / (0.899216740707317,-0.646249678878652) / (0.490919777627372,- ...` | value |
| circles_arcs.asy:78 | `wpath(arc((0,0), 1, 10, 350));` | `len=4 / (0.984971734298905,0.173677091992107) / (0.902755718499729,0.6431754969515) / (0.493048273354225,0.999 ...` | `len=4 / (0.983888661174127,0.179751264701663) / (0.899216740707317,0.646249678878652) / (0.490919777627372,1)  ...` | value |
| circles_arcs.asy:79 | `wpath(arc((0,0), 1, 45, 45));` | `len=5 / (0.707106781186548,0.707106781186547) / (0.526142374915397,0.888071187457698) / (0.276142374915397,1)  ...` | `len=0 / (0,0)` | value |
| circles_arcs.asy:80 | `wpath(arc((2,0), 1, 180, 360));` | `len=3 / (1,6.66133814775094e-16) / (1,4.44089209850063e-16) / (1,2.22044604925031e-16) / (1,0) / (1,-0.5522847 ...` | `len=2 / (1,0) / (1,-0.552284749830794) / (1.44771525016921,-1) / (2,-1) / (2.55228474983079,-1) / (3,-0.552284 ...` | value |
| misc_builtins.asy:29 | `write(min(unitcircle));` | `(-1,-1)` | `0` | value |
| misc_builtins.asy:30 | `write(max(circle((2,3), 1)));` | `(3,4)` | `0` | value |
| mod_cse5.asy:19 | `wpath(CR(A, 2));` | `len=400 / (2,0) / (2,0.0104720293426395) / (1.99991775245111,0.0209438971892738) / (1.99975326496332,0.0314146 ...` | `len=4 / (2,0) / (2.0000000003758,0.0104719755143272) / (1.99991775198136,0.0209439510168482) / (1.999753264963 ...` | value |
| mod_cse5.asy:20 | `wpath(CR((1,1), 1, 0, 90));` | `len=400 / (2,1) / (2,1.00130899735955) / (1.99999742978887,1.00261799345744) / (1.99999228938147,1.00392698072 ...` | `len=1 / (2,1) / (2,1.55228474983079) / (1.55228474983079,2) / (1,2)` | value |
| mod_cse5.asy:21 | `wpath(CP(A, B));` | `len=400 / (4,0) / (4,0.020944058685279) / (3.99983550490221,0.0418877943785477) / (3.99950652992664,0.06282926 ...` | `len=0 / (0,0)` | value |
| mod_cse5.asy:28 | `write(OP(CR(A, 2), (-3,1)--(3,1)));` | `(-1.73205052195628,1.00000049469536)` | `` | missing |
| mod_geometry.asy:9 | `write(circumcircle(t).r);` | `2.23606797749979` | `` | missing |
| mod_geometry.asy:10 | `write(incircle(t).r);` | `1.05217763377095` | `` | missing |
| mod_geometry.asy:11 | `write((pair)circumcircle(t).C);` | `(2,1)` | `(0,0)` | value |
| mod_olympiad.asy:33 | `wpath(circumcircle(A, B, C));` | `len=400 / (5.41547594742265,1.5) / (5.41547594742266,1.51526547483459) / (5.41535605204738,1.53053071425031) / ...` | `len=4 / (5.41547594742265,1.5) / (5.41547594797047,1.51526539636701) / (5.41535605136261,1.53053079271681) / ( ...` | value |
| mod_olympiad.asy:34 | `wpath(incircle(A, B, C));` | `len=400 / (3.08630933463537,1.35318364657273) / (3.08630933463537,1.36026893599917) / (3.0862536866163,1.36735 ...` | `len=4 / (3.08630933463537,1.35318364657273) / (3.08630933488963,1.36026889957938) / (3.08625368629847,1.367354 ...` | value |
| mod_olympiad.asy:64 | `write(length(circumcircle(A, B, C)));` | `400` | `4` | value |
| mod_olympiad.asy:68 | `write(arclength(circumcircle(A, B, C)));` | `18.3184756362815` | `18.3136783381056` | value |

<a id="graph"></a>
### 2. graph module: graph(), Circle/Arc sampling, interpolation

Corpus usage: `graph` 1161, `Circle` 2036, `Arc` 102, `polargraph` 32.

**Likely cause.** graph(f,a,b[,n]) (L14612) samples the right nodes (node positions and length() match) but the segments between samples are curves that follow f, whatever join was requested. asy's default join is `--` (straight chords): point(graph(f,-1,1,n=4), 1.5) is the chord midpoint (-0.25,0.125) in asy but f(-0.25) = (-0.25,0.0625) in HiTeXeR, and sin sampled at 10 points gives 0.6984 vs 0.7069 between nodes. With `operator ..` asy runs the Hobby spline through the samples (point(g3,50.5) = (0.50501,0.25504)), HiTeXeR returns the exact f value. Polar/parametric graphs behave the same way. Circle(c,r,n)/Arc(c,r,a1,a2,n): see circle category (asy builds n-segment `..` polygons).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| mod_graph.asy:13 | `write(point(g2, 1.5));` | `(-0.25,0.125)` | `(-0.25,0.0625)` | value |
| mod_graph.asy:16 | `write(point(g3, 50.5));` | `(0.505012499347058,0.255037623868531)` | `(0.505,0.255025)` | value |
| mod_graph.asy:20 | `write(point(g4, 2.5));` | `(0.785398163397448,0.69840112333371)` | `(0.785398163397448,0.706946669333543)` | value |
| mod_graph.asy:24 | `write(point(pg, 2));` | `(0.707106781186548,0.707106781186548)` | `(0.707106781186548,0.707106781186547)` | epsilon |
| mod_graph.asy:25 | `write(point(pg, 2.5));` | `(0.544895106775819,0.815493156848917)` | `(0.555264524340841,0.831012086932214)` | value |
| mod_graph.asy:28 | `write(point(pg2, 1.5));` | `(0.38268343236509,0.923879532511287)` | `(0.379441738241592,0.916053390593274)` | value |
| mod_graph.asy:30 | `write(length(c1));` | `400` | `4` | value |
| mod_graph.asy:34 | `write(length(c2));` | `8` | `4` | value |
| mod_graph.asy:35 | `write(point(c2, 1));` | `(2.41421356237309,2.41421356237309)` | `(2.99975326496332,1.03141463462364)` | value |
| mod_graph.asy:36 | `write(point(c2, 1.5));` | `(1.76536686473018,2.84775906502257)` | `(2.999444860436,1.04711952966722)` | value |
| mod_graph.asy:38 | `write(length(a1));` | `400` | `1` | value |
| mod_graph.asy:39 | `write(point(a1, length(a1)));` | `(6.12323399573677e-17,1)` | `(0,1)` | epsilon |
| mod_graph.asy:40 | `write(point(a1, 200.5));` | `(0.705717018101517,0.708493818153626)` | `(0,1)` | value |
| mod_graph.asy:42 | `write(length(a2));` | `3` | `1` | value |
| mod_graph.asy:43 | `write(point(a2, 1));` | `(1.73205080756888,1)` | `(0,2)` | value |
| mod_graph.asy:44 | `write(point(a2, 1.5));` | `(1.4142135623731,1.41421356237309)` | `(0,2)` | value |
| mod_graph.asy:49 | `write(point(gd, 1.5));` | `(1.5,2.5)` | `(1.5,2.25)` | value |
| mod_graph.asy:56 | `write(point(pol, 2.5));` | `(-0.103553390593274,0.603553390593274)` | `(-0.191941738241592,0.603553390593274)` | value |

<a id="constants"></a>
### 3. Built-in constants and misc builtins

Corpus usage: `Npt` 1573, `Degrees` 0, `hypot` 2.

**Likely cause.** pt is 1 (L9384) but asy's pt = 72/72.27 = 0.99626400996264 (bp is 1): every "12pt" length is 0.4% too big. intMax (L8386) is 2^31-1; asy is 64-bit (9223372036854775805). realEpsilon is only defined when the geometry module installs (L20441). Missing: arrowlength, arrowangle, labelmargin, legendmargin, log1p, expm1, fabs, hypot, erf, Jn, Yn. identity(real) returns the identity transform. Degrees(x) (L9756) returns x unchanged instead of degrees in [0,360). dir(45) == (sqrt(2)/2, sqrt(2)/2) is false in HiTeXeR because dir computes cos(a*pi/180) instead of asy's exactly-rounded degree sin/cos.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| math_funcs.asy:12 | `write(log1p(0.5));` | `0.405465108108164` | `` | missing |
| math_funcs.asy:13 | `write(expm1(0.5));` | `0.648721270700128` | `` | missing |
| math_funcs.asy:33 | `write(Cos(90));` | `0` | `6.12323399573677e-17` | epsilon |
| math_funcs.asy:34 | `write(Sin(180));` | `0` | `1.22464679914735e-16` | epsilon |
| math_funcs.asy:51 | `write(fabs(-2.5));` | `2.5` | `` | missing |
| math_funcs.asy:54 | `write(hypot(3,4));` | `5` | `` | missing |
| math_funcs.asy:65 | `write(identity(4.5));` | `4.5` | `{"_tag":"transform","a":0,"b":1,"c":0,"d":0,"e":0,"f":1}` | value |
| math_funcs.asy:68 | `write(erf(1));` | `0.842700792949715` | `` | missing |
| math_funcs.asy:80 | `write(Degrees(-pi/2));` | `270` | `-1.5707963267949` | value |
| math_funcs.asy:81 | `write(Degrees(3*pi/2));` | `270` | `4.71238898038469` | value |
| math_funcs.asy:82 | `write(Jn(0,1));` | `0.765197686557966` | `` | missing |
| math_funcs.asy:83 | `write(Yn(0,1));` | `0.0882569642156769` | `` | missing |
| misc_builtins.asy:16 | `write(point(cyc2, 0));` | `(1.32444396573649e-31,0)` | `(0,0)` | epsilon |
| misc_builtins.asy:17 | `write(point(cyc2, 1.5));` | `(3.41421356237309,1.41421356237309)` | `(3.4142135623731,1.41421356237309)` | epsilon |
| misc_builtins.asy:37 | `write(NE);` | `(0.707106781186547,0.707106781186547)` | `(0.707106781186548,0.707106781186548)` | epsilon |
| misc_builtins.asy:38 | `write(SW);` | `(-0.707106781186547,-0.707106781186547)` | `(-0.707106781186548,-0.707106781186548)` | epsilon |
| misc_builtins.asy:46 | `write(realEpsilon > 0);` | `true` | `false` | value |
| misc_builtins.asy:48 | `write(intMax);` | `9223372036854775805` | `2147483647` | value |
| misc_builtins.asy:53 | `write(pt);` | `0.99626400996264` | `1` | value |
| misc_builtins.asy:58 | `write(arrowlength);` | `21.259842519685` | `` | missing |
| misc_builtins.asy:59 | `write(arrowangle);` | `15` | `` | missing |
| misc_builtins.asy:73 | `write(labelmargin);` | `0.28` | `` | missing |
| misc_builtins.asy:74 | `write(legendmargin);` | `10` | `` | missing |
| misc_builtins.asy:77 | `write(dir(45) == (sqrt(2)/2, sqrt(2)/2));` | `true` | `false` | value |

<a id="extension"></a>
### 4. extension() of parallel lines (non-parallel extension() is exact)

Corpus usage: `extension` 1449.

**Likely cause.** extension (L12080) returns (0,0) for parallel lines; asy returns (infinity, infinity) where infinity = 5.64380309412236e+102 (cbrt(realMax)). Diagrams then draw to the origin instead of off-page.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| intersections.asy:73 | `write(extension((0,0), (1,0), (0,1), (1,1)));` | `(5.64380309412236e+102,5.64380309412236e+102)` | `(0,0)` | value |
| mod_olympiad.asy:59 | `write(extension(A, C, B, (3,3)));` | `(1.36363636363636,5.45454545454546)` | `(1.36363636363636,5.45454545454545)` | epsilon |

<a id="intersect"></a>
### 5. Path intersections are only accurate to ~1e-4

Corpus usage: `intersectionpoint` 670, `intersectionpoints` 825, `IP` 20, `IPs` 61, `intersect` 14, `buildcycle` 51.

**Likely cause.** bezierBezierIntersect (L27763) and bezierBezierIntersectFirstT (L27830) recurse on bounding boxes with `tol = 1e-4` and return the midpoint of the converged boxes, so every intersection point/time is off by up to ~1e-4 (e.g. (2,2) comes back as (1.99992,1.99995)). asy's intersect() converges to ~1e-15 (its fuzz is realEpsilon-scaled). Fix: after the box recursion, polish with Newton on (B1(s)-B2(t)) or recurse until the boxes are < 1e-12 (asy's default fuzz). Also: intersectionpoints(circle, x=1 tangent line) returns 8 duplicates instead of asy's 1 (no de-duplication of hits near segment joints); intersections(sq, (1,-1)--(1,3)) and the intersections(path, pair, pair) (line) overload are missing/empty; intersect() (L12163) returns only the first hit found in segment order and intersectionpoints order can differ from asy's sort by time in the first path. buildcycle (L10877) inherits the imprecision (corners off by 1e-4). times(path, pair) (L12091) treats the pair as an x value; asy's times(p, z) solves for the *point* z (here returns 0 and 2 for (1,0) on the circle).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| circles_arcs.asy:57 | `write(intersectionpoint(unitcircle, (0,0)--(2,2)));` | `(0.707106781186548,0.707106781186547)` | `(0.707070324198885,0.707037188626457)` | value |
| intersections.asy:17 | `write(intersectionpoint(a, b));` | `(2,2)` | `(1.99992370605469,1.99995422363281)` | value |
| intersections.asy:18 | `wr(intersect(a, b));` | `n=2 / 0.5 / 0.5` | `n=2 / 0.499973297119141 / 0.499996185302734` | value |
| intersections.asy:20 | `write(intersectionpoints(a, b)[0]);` | `(2,2)` | `(1.99993896484375,1.99995422363281)` | value |
| intersections.asy:25 | `write(ip[0]);` | `(1.73243560947757,1)` | `(1.73244803877787,0.9999534500348)` | value |
| intersections.asy:26 | `write(ip[1]);` | `(-1.73243560947757,1)` | `(-1.73243476546067,1.00005552810805)` | value |
| intersections.asy:27 | `wr(intersect(c, l));` | `n=2 / 0.329800110886399 / 0.788739268246261` | `n=2 / 0.329765319824219 / 0.788734436035156` | value |
| intersections.asy:28 | `wr(intersect(l, c));` | `n=2 / 0.788739268246261 / 0.329800110886399` | `n=2 / 0.788703918457031 / 0.329841613769531` | value |
| intersections.asy:31 | `write(t[0][0]);` | `0.329800110886399` | `0.329785062932663` | value |
| intersections.asy:32 | `write(t[0][1]);` | `0.788739268246261` | `0.788741340428552` | value |
| intersections.asy:33 | `write(t[1][0]);` | `1.6701998891136` | `1.67018420474932` | value |
| intersections.asy:34 | `write(t[1][1]);` | `0.211260731753739` | `0.211260871789651` | value |
| intersections.asy:35 | `write(intersections(l, c)[0][0]);` | `0.211260731753739` | `0.211260871789651` | value |
| intersections.asy:36 | `write(intersections(l, c)[1][0]);` | `0.788739268246261` | `0.788741340428552` | value |
| intersections.asy:40 | `write(cc[0]);` | `(1.00000000001482,1.73243560946899)` | `(1.00010207807325,1.73243041166041)` | value |
| intersections.asy:41 | `write(cc[1]);` | `(0.999999999985617,-1.73243560948589)` | `(0.99989792192675,-1.73243041166041)` | value |
| intersections.asy:42 | `write(intersectionpoint(c, c2));` | `(1.00000000001482,1.73243560946899)` | `(1.00012249368788,1.73243041049203)` | value |
| intersections.asy:46 | `wr(times(c, (1,0)));` | `n=2 / 0 / 2` | `n=2 / 0.670199889103374 / 3.32980011089663` | value |
| intersections.asy:49 | `wr(times((0,0)--(4,0)--(4,4), (0,1)));` | `n=1 / 1.25` | `n=1 / 0.25` | value |
| intersections.asy:54 | `write(sd[0]);` | `(0,0)` | `(1.99994659423828,1.99983978271484)` | value |
| intersections.asy:55 | `write(sd[1]);` | `(2,2)` | `(-0.0000381469726562778,-0.0000534057617187778)` | value |
| intersections.asy:57 | `write(intersections(sq, (1,-1)--(1,3))[0][0]);` | `0.5` | `0.499977111436768` | value |
| intersections.asy:58 | `write(intersections(sq, (1,-1)--(1,3))[1][0]);` | `2.5` | `2.49997711143677` | value |
| intersections.asy:59 | `write(intersections(sq, (-1,1), (1,0)).length);` | `2` | `0` | value |
| intersections.asy:60 | `write(intersections(sq, (-1,1), (1,0))[0]);` | `0.5` | `` | missing |
| intersections.asy:61 | `write(intersectionpoints(unitcircle, (0,0)--(1,1))[0]);` | `(0.707106781186548,0.707106781186547)` | `(0.707069669893193,0.707053102106978)` | value |
| intersections.asy:62 | `write(intersectionpoint(unitcircle, (0,0)--(dir(30)*2)));` | `(0.866169630634358,0.500083269410626)` | `(0.866158544034217,0.499997087900234)` | value |
| intersections.asy:65 | `write(ci[0]);` | `(1,1.50690016152302e-12)` | `(0.999962077668255,0.0000126422853115652)` | value |
| intersections.asy:66 | `write(ci[1]);` | `(7.53450080760992e-12,1)` | `(0.0000379235826271542,1.00003792045542)` | value |
| intersections.asy:68 | `write(intersectionpoint(s, (0,1)--(3,1)));` | `(2.96055656145023,1)` | `(2.9604346633686,1.00006001321912)` | value |
| intersections.asy:71 | `wr(intersect(s, (0,1)--(3,1)));` | `n=2 / 1.71060947578771 / 0.986852187150076` | `n=2 / 1.71057891845703 / 0.986801147460938` | value |
| intersections.asy:77 | `write(intersectionpoints(arc((0,0),1,0,180), (-2,0.5)--(2,0. ...` | `(0.866217804738783,0.5)` | `(0.866227335443187,0.499951204023119)` | value |
| intersections.asy:78 | `write(intersectionpoints(arc((0,0),1,0,180), (-2,0.5)--(2,0. ...` | `(-0.866217804738783,0.5)` | `(-0.866198803337059,0.500053282096241)` | value |
| intersections.asy:80 | `write(intersectionpoints(circle((0,0),1), (1,-1)--(1,1)).len ...` | `1` | `8` | value |
| intersections.asy:81 | `write(intersectionpoints(circle((0,0),1), (1,-1)--(1,1))[0]) ...` | `(1,0)` | `(0.999999999687277,-0.000033135645481467)` | value |
| intersections.asy:82 | `write(intersectionpoints(circle((0,0),3), circle((4,0),2))[0 ...` | `(2.62541007938696,1.45276342822314)` | `(2.62546417570109,1.45274908670976)` | value |
| intersections.asy:83 | `write(intersectionpoints(circle((0,0),3), circle((4,0),2))[1 ...` | `(2.62541007937878,-1.45276342823791)` | `(2.62536160004274,-1.45279367470105)` | value |
| intersections.asy:84 | `write(intersectionpoint(circle((0,0),3), (0,0)--(5,5)));` | `(2.12132034355964,2.12132034355964)` | `(2.12132922821189,2.12122982149461)` | value |
| intersections.asy:85 | `write(intersectionpoint((0,0)--(10,3), (5,-5)--(5,5)));` | `(5,1.5)` | `(4.99992370605469,1.49987030029297)` | value |
| intersections.asy:86 | `write(intersectionpoints((0,0)..(2,2)..(4,0), (0,1)--(4,1))[ ...` | `(0.267564390522435,1)` | `(0.267468037875555,0.999953450048485)` | value |
| intersections.asy:87 | `write(intersectionpoints((0,0)..(2,2)..(4,0), (0,1)--(4,1))[ ...` | `(3.73243560947757,1)` | `(3.73232032454944,1.00005552812173)` | value |
| misc_builtins.asy:10 | `write(point(cyc, 0));` | `(0,0)` | `(0.0000457763671875,0)` | value |
| misc_builtins.asy:11 | `write(point(cyc, 1));` | `(3,0)` | `(2.99986267089844,0)` | value |
| misc_builtins.asy:12 | `write(point(cyc, 2));` | `(3,2)` | `(3,1.99990844726562)` | value |
| misc_builtins.asy:13 | `write(point(cyc, 3));` | `(0,2)` | `(0.0000991821289061945,2)` | value |
| mod_cse5.asy:25 | `wp(IPs(CR(A, 2), (-3,1)--(3,1)));` | `n=2 / (1.73205028227203,1.00000090984028) / (-1.73205052195628,1.00000049469536)` | `n=2 / (1.73244803877787,0.9999534500348) / (-1.73243476546067,1.00005552810805)` | value |
| mod_cse5.asy:26 | `write(IP(CR(A, 2), (-3,1)--(3,1)));` | `(1.73205028227203,1.00000090984028)` | `(1.73243105497851,0.999943241847258)` | value |
| mod_cse5.asy:27 | `write(IP(CR(A, 2), (-3,1)--(3,1), 1));` | `(-1.73205052195628,1.00000049469536)` | `(1.73243105497851,0.999943241847258)` | value |
| mod_cse5.asy:31 | `wp(commonpoints(CR(A,2), CR(B,3)));` | `n=2 / (1.37500130047038,1.45236752363331) / (1.37499886370046,-1.45236983059497)` | `n=null` | value |
| mod_olympiad.asy:61 | `wp(intersectionpoints(circumcircle(A,B,C), (-10,1)--(10,1))) ...` | `n=2 / (-0.372281323269014,1) / (5.37228132326901,0.999999999999999)` | `n=2 / (-0.372834062628567,1.0000437163864) / (5.37270141205643,0.999938357662705)` | value |
| mod_olympiad.asy:69 | `write(intersectionpoint(circumcircle(A,B,C), C--(10,10)));` | `(0.999999999999915,3.99999999999995)` | `(1.00702231552157,4.00469812725458)` | value |
| path_ops.asy:70 | `write(intersectionpoint(A..B..C, (2,-5)--(2,5)));` | `(2,-1.28676366023651)` | `(1.99992633239204,-1.28684496248709)` | value |

<a id="strings"></a>
### 6. Strings: string()/format() number formatting and string functions

Corpus usage: `string` 622, `format(` 21, `string(real,n)` 0.

**Likely cause.** _asyStringReal (L13042) formats with toPrecision(9); asy's string(real) uses 15 significant digits (string(1/3) = 0.333333333333333) and switches to e-notation like C's %g (1e-05, 1e+20). string(x, digits) (L13054) ignores the precision argument (string(pi,3) should be 3.14). `(string)x` cast (evalCast L5766) uses JS String() (16-17 digits). format() (L13059): no width/zero padding ("%5.2f", "%03d"), no %i/%x, %e exponent has one digit (e+4 vs e+04), rounding is JS toFixed not C (format("%.1f",2.25) = 2.2 in asy, "%.0f" of 2.5 = 2), and format(real) with no format string must produce asy's default TeX-ready string ("$3.142$", "$1\!\times\!10^{-7}$"). find(s, t, start) ignores start; replace() only replaces the first occurrence; reverse(string) is a no-op; rfind, insert, erase, downcase, upcase, stripsuffix are missing.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| strings.asy:4 | `write("x" + string(1/3));` | `x0.333333333333333` | `x0.333333333` | epsilon |
| strings.asy:6 | `write("x" + string(1e-5));` | `x1e-05` | `x0.00001` | format |
| strings.asy:8 | `write("x" + string(1e20));` | `x1e+20` | `x100000000000000000000` | format |
| strings.asy:9 | `write("x" + string(pi));` | `x3.14159265358979` | `x3.14159265` | value |
| strings.asy:13 | `write(string(pi, 3));` | `3.14` | `3.14159265` | value |
| strings.asy:14 | `write(string(pi, 10));` | `3.141592654` | `3.14159265` | value |
| strings.asy:15 | `write(string(1234.5678, 2));` | `1.2e+03` | `1234.5678` | value |
| strings.asy:16 | `write(string(0.000123456, 2));` | `0.00012` | `0.000123456` | value |
| strings.asy:19 | `write(format("%5.2f", pi));` | ` 3.14` | `3.14` | value |
| strings.asy:21 | `write(format("%e", 12345.678));` | `1.234568e+04` | `1.234568e+4` | format |
| strings.asy:23 | `write(format("$%.1f$", 2.25));` | `$2.2$` | `$2.3$` | value |
| strings.asy:24 | `write(format("%i", 7));` | `7` | `%i` | value |
| strings.asy:25 | `write(format("%03d", 7));` | `007` | `7` | format |
| strings.asy:27 | `write(format("%f", 1.0));` | `1` | `1.000000` | format |
| strings.asy:28 | `write(format("%.0f", 2.5));` | `2` | `3` | value |
| strings.asy:29 | `write(format(3.14159));` | `$3.142$` | `3.14159` | value |
| strings.asy:32 | `write(format(-2.5));` | `$-2.5$` | `-2.5` | value |
| strings.asy:34 | `write(format("%x", 255));` | `ff` | `%x` | value |
| strings.asy:41 | `write(find("hello", "l", 3));` | `3` | `2` | value |
| strings.asy:42 | `write(rfind("hello", "l"));` | `3` | `` | missing |
| strings.asy:43 | `write(replace("hello world", "o", "0"));` | `hell0 w0rld` | `hell0 world` | value |
| strings.asy:44 | `write(reverse("abc"));` | `cba` | `abc` | value |
| strings.asy:45 | `write(insert("abc", 1, "XY"));` | `aXYbc` | `` | missing |
| strings.asy:46 | `write(erase("abcdef", 1, 2));` | `adef` | `` | missing |
| strings.asy:47 | `write(downcase("HeLLo"));` | `hello` | `` | missing |
| strings.asy:48 | `write(upcase("HeLLo"));` | `HELLO` | `` | missing |
| strings.asy:62 | `write(1, 2);` | `1	2` | `12` | value |
| strings.asy:64 | `write("$" + string(sqrt(2), 4) + "$");` | `$1.414$` | `$1.41421356$` | value |
| strings.asy:65 | `write("$" + (string)(1/3) + "$");` | `$0.333333333333333$` | `$0.3333333333333333$` | epsilon |
| strings.asy:68 | `write(stripsuffix("hello.txt", ".txt"));` | `hello` | `` | missing |
| strings.asy:74 | `write(string(-1e-10));` | `-1e-10` | `-1.00000000e-10` | format |
| strings.asy:76 | `write(string(sqrt(3)/2));` | `0.866025403784439` | `0.866025404` | epsilon |

<a id="geometry"></a>
### 7. geometry.asy module (point/line/circle/triangle structs)

Corpus usage: `import geometry` 339.

**Likely cause.** The geometry-module structs are emulated (installGeometry around L18500-L20900): circle.r, circumcircle(t).r / .C, triangle side methods t.a()/b()/c(), t.alpha(), foot(t.VC), midpoint(t.AB) return nothing or (0,0). Point-returning free functions (circumcenter/incenter/orthocentercenter/centroid/projection/ intersectionpoints(line,circle)) match.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| mod_geometry.asy:17 | `write(c.r);` | `2` | `` | missing |
| mod_geometry.asy:25 | `write(t.a());` | `4.24264068711928` | `` | missing |
| mod_geometry.asy:26 | `write(t.b());` | `3.16227766016838` | `` | missing |
| mod_geometry.asy:27 | `write(t.c());` | `4` | `` | missing |
| mod_geometry.asy:33 | `write(degrees(t.alpha()));` | `4100.37539308431` | `0` | value |
| mod_geometry.asy:34 | `write(t.alpha());` | `71.565051177078` | `` | missing |
| mod_geometry.asy:35 | `write((pair)foot(t.VC));` | `(1,0)` | `(0,0)` | value |

<a id="operators"></a>
### 8. Operators: bool ^, compound #= %= ^=, prefix --

Corpus usage: `#` 14, `%` 295.

**Likely cause.** evalBinaryValues (L4104): `^` on bools is Math.pow (true^true = 1) instead of xor. evalAssignment (L6483) only maps '+=','-=','*=','/=' (L6492/6529/6539/6553); `#=`, `%=`, `^=` silently do nothing. Prefix `--k` (parse L1612) returns the old value / does not decrement (write(--k) gave 1, asy 0), and ++/-- inside an if/while condition do not update the variable (infinite loop).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| bool_compare.asy:11 | `write(true ^ true);` | `false` | `1` | value |
| bool_compare.asy:12 | `write(true ^ false);` | `true` | `1` | value |
| bool_compare.asy:32 | `write(i);` | `4` | `14` | value |
| bool_compare.asy:34 | `write(i);` | `1` | `14` | value |
| bool_compare.asy:39 | `write(r);` | `6.25` | `2.5` | value |
| bool_compare.asy:45 | `write(--k);` | `0` | `1` | value |
| bool_compare.asy:49 | `write(a, b);` | `7	7` | `77` | value |

<a id="subpath"></a>
### 9. Path queries: subpath/reverse edge cases, missing path builtins

Corpus usage: `point` 226, `reverse` 143, `subpath` 13, `inside` 4, `windingnumber` 0, `beginpoint` 0, `endpoint` 0, `precontrol` 0.

**Likely cause.** subpath (L11283) clamps a and b to [0,n] and returns an empty path when a > b; asy returns the reversed subpath (subpath(p,2,1) = (4,3)--(4,0)). For cyclic paths asy wraps times outside [0,n] (subpath(q,3,5) has 2 segments, subpath(tri,2.5,0.5) goes backwards through the corners); HiTeXeR clamps. length(nullpath) is -1 in asy (HiTeXeR 0). size(path), cyclic(path), beginpoint/endpoint, precontrol/postcontrol, accel, radius, dirtime, straight, piecewisestraight, windingnumber, mintimes/maxtimes are not implemented (unknown call). inside (L12472) returns false for a point on the boundary; asy's inside() uses the nonzero winding rule with boundary points counted inside.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| circles_arcs.asy:66 | `wpath(reverse(unitcircle));` | `len=4 / (1,0) / (1,-0.552284749830794) / (0.552284749830794,-1) / (0,-1) / (-0.552284749830793,-1) / (-1,-0.55 ...` | `len=4 / (1,0) / (1,-0.552284749799999) / (0.552284749799999,-1) / (0,-1) / (-0.5522847498,-1) / (-0.9999999999 ...` | epsilon |
| circles_arcs.asy:74 | `wpath(subpath(unitcircle, 1, 3));` | `len=2 / (0,1) / (-0.552284749830794,1) / (-1,0.552284749830794) / (-1,0) / (-1,-0.552284749830793) / (-0.55228 ...` | `len=2 / (0,1) / (-0.5522847498,1) / (-1,0.5522847498) / (-1,0) / (-1,-0.5522847498) / (-0.552284749800001,-1)  ...` | epsilon |
| misc_builtins.asy:75 | `write(fontsize(currentpen));` | `11.9551681195517` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":0,"opacity":1,"linecap":` | value |
| mod_olympiad.asy:38 | `write(cyclic((1,0), (0,1), (-1,0), (0,-1)));` | `true` | `` | missing |
| mod_olympiad.asy:39 | `write(cyclic((1,0), (0,1), (-1,0), (0,-2)));` | `false` | `` | missing |
| path_basic.asy:17 | `write(size(p));` | `3` | `` | missing |
| path_basic.asy:18 | `write(cyclic(p));` | `false` | `` | missing |
| path_basic.asy:35 | `write(beginpoint(p));` | `(0,0)` | `` | missing |
| path_basic.asy:36 | `write(endpoint(p));` | `(4,3)` | `` | missing |
| path_basic.asy:45 | `write(precontrol(p, 1));` | `(2.66666666666667,0)` | `` | missing |
| path_basic.asy:46 | `write(postcontrol(p, 1));` | `(4,1)` | `` | missing |
| path_basic.asy:47 | `write(precontrol(p, 0));` | `(0,0)` | `` | missing |
| path_basic.asy:48 | `write(postcontrol(p, 0.5));` | `(2.66666666666667,0)` | `` | missing |
| path_basic.asy:53 | `write(size(q));` | `4` | `` | missing |
| path_basic.asy:54 | `write(cyclic(q));` | `true` | `` | missing |
| path_basic.asy:63 | `wpath(reverse(p));` | `len=2 / (4,3) / (4,2) / (4,1) / (4,0) / (2.66666666666667,0) / (1.33333333333333,0) / (0,0)` | `len=2 / (4,3) / (4,2) / (4,0.999999999999999) / (4,0) / (2.66666666666667,0) / (1.33333333333333,0) / (0,0)` | epsilon |
| path_basic.asy:64 | `wpath(subpath(p, 0.5, 1.5));` | `len=2 / (2,0) / (2.66666666666667,0) / (3.33333333333333,0) / (4,0) / (4,0.5) / (4,0.999999999999999) / (4,1.5 ...` | `len=2 / (2,0) / (2.66666666666667,0) / (3.33333333333333,0) / (4,0) / (4,0.5) / (4,1) / (4,1.5)` | epsilon |
| path_basic.asy:65 | `wpath(subpath(p, 2, 1));` | `len=1 / (4,3) / (4,2) / (4,1) / (4,0)` | `len=0 / (0,0)` | value |
| path_basic.asy:66 | `wpath(subpath(q, 3, 5));` | `len=2 / (0,1) / (0,0.666666666666667) / (0,0.333333333333333) / (0,0) / (0.333333333333333,0) / (0.66666666666 ...` | `len=1 / (0,1) / (0,0.666666666666667) / (0,0.333333333333333) / (0,0)` | value |
| path_basic.asy:72 | `write(size(pp));` | `1` | `` | missing |
| path_basic.asy:75 | `write(length(e));` | `-1` | `0` | value |
| path_basic.asy:76 | `write(size(e));` | `0` | `` | missing |
| path_basic.asy:84 | `write(straight((0,0)--(1,1), 0));` | `true` | `` | missing |
| path_basic.asy:85 | `write(straight((0,0)..(1,1)..(2,0), 0));` | `false` | `` | missing |
| path_basic.asy:86 | `write(piecewisestraight((0,0)--(1,1)));` | `true` | `` | missing |
| path_basic.asy:87 | `write(piecewisestraight((0,0)..(1,1)));` | `true` | `` | missing |
| path_basic.asy:96 | `write(size(pa));` | `4` | `` | missing |
| path_basic.asy:97 | `write(windingnumber(q, (0.5,0.5)));` | `1` | `` | missing |
| path_basic.asy:98 | `write(windingnumber(q, (2,2)));` | `0` | `` | missing |
| path_basic.asy:99 | `write(windingnumber(reverse(q), (0.5,0.5)));` | `-1` | `` | missing |
| path_basic.asy:102 | `write(inside(q, (1, 0.5)));` | `true` | `false` | value |
| path_basic.asy:103 | `write(accel(p, 1));` | `(0,0)` | `` | missing |
| path_basic.asy:104 | `write(radius(p, 0.5));` | `0` | `` | missing |
| path_basic.asy:105 | `write(dirtime(p, (0,1)));` | `1` | `` | missing |
| path_basic.asy:106 | `write(cyclic((0,0)--(1,0)--cycle));` | `true` | `` | missing |
| path_basic.asy:118 | `wpath(subpath(p, -1, 5));` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,1) / (4,2) / (4,3)` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,0.999999999999999) / (4,2) / (4,3)` | epsilon |
| path_basic.asy:119 | `wpath(reverse(q));` | `len=4 / (0,0) / (0,0.333333333333333) / (0,0.666666666666667) / (0,1) / (0.333333333333333,1) / (0.66666666666 ...` | `len=4 / (0,0) / (0,0.333333333333332) / (0,0.666666666666668) / (0,1) / (0.333333333333333,1) / (0.66666666666 ...` | epsilon |
| path_curves.asy:17 | `write(precontrol(c, 1));` | `(0.447715250169207,1)` | `` | missing |
| path_curves.asy:18 | `write(postcontrol(c, 1));` | `(1.55228474983079,1)` | `` | missing |
| path_curves.asy:19 | `write(postcontrol(c, 0));` | `(1.11022302462516e-16,0.552284749830793)` | `` | missing |
| path_curves.asy:20 | `write(precontrol(c, 2));` | `(2,0.552284749830793)` | `` | missing |
| path_curves.asy:62 | `write(accel(s, 1.5));` | `(0.822354133952562,-2.41267888949128)` | `` | missing |
| path_curves.asy:63 | `write(radius(s, 1.0));` | `4.7543563797429` | `` | missing |
| path_curves.asy:64 | `wpath(subpath(s, 0.5, 2.5));` | `len=3 / (0.396715740508432,1.05164212974578) / (0.564271377029993,1.38675340278891) / (0.766255100048741,1.704 ...` | `len=3 / (0.396715740508432,1.05164212974578) / (0.564271377029993,1.38675340278891) / (0.766255100048742,1.704 ...` | epsilon |
| path_curves.asy:65 | `wpath(reverse(s));` | `len=3 / (4,1) / (4.38985880052925,1.83315973581335) / (3.90044306896823,2.81199119893539) / (3,3) / (2.2185355 ...` | `len=3 / (4,1) / (4.38985880052925,1.83315973581335) / (3.90044306896823,2.81199119893539) / (3,3) / (2.2185355 ...` | epsilon |
| path_curves.asy:68 | `write(dirtime(s, (1,0)));` | `1.87443273208354` | `` | missing |
| path_curves.asy:69 | `write(dirtime(s, (0,-1)));` | `2.76340106451067` | `` | missing |
| path_curves.asy:72 | `wr(mintimes(s));` | `n=2 / 0 / 0` | `n=null` | value |
| path_curves.asy:73 | `wr(maxtimes(s));` | `n=2 / 2.76340106451067 / 1.87443273208354` | `n=null` | value |
| path_ops.asy:30 | `wpath(reverse(tri));` | `len=3 / (0,0) / (0.333333333333333,1) / (0.666666666666667,2) / (1,3) / (2,2) / (3,1) / (4,0) / (2.66666666666 ...` | `len=3 / (0,0) / (0.333333333333334,1) / (0.666666666666666,2) / (1,3) / (2,2) / (3,1) / (4,0) / (2.66666666666 ...` | epsilon |
| pens.asy:21 | `write(fontsize(fontsize(12)));` | `12` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":0,"opacity":1,"linecap":` | value |
| pens.asy:22 | `write(fontsize(defaultpen));` | `11.9551681195517` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":0,"opacity":1,"linecap":` | value |
| pens.asy:23 | `write(fontsize(currentpen + fontsize(8)));` | `8` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":0,"opacity":1,"linecap":` | value |

<a id="pairs"></a>
### 10. Pair functions

Corpus usage: `cross` 201, `minbound` 0, `maxbound` 0, `abs2` 0.

**Likely cause.** cross(pair,pair) (L9938) returns a triple (0,0,z); asy's 2D cross returns the real z. exp(pair) and log(pair) (L9545/L9544) treat the pair as a real (complex exp/log expected). abs2, minbound, maxbound missing. sqrt((-4,0)) and similar give 1e-16 noise instead of exact 0 (asy special-cases the branch).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| pairs.asy:15 | `write(abs2(z));` | `25` | `` | missing |
| pairs.asy:26 | `write(cross(z, w));` | `-10` | `(0,0,-10)` | value |
| pairs.asy:34 | `write(dir(-45));` | `(0.707106781186548,-0.707106781186548)` | `(0.707106781186548,-0.707106781186547)` | epsilon |
| pairs.asy:40 | `write(rotate(45)*(1,0));` | `(0.707106781186548,0.707106781186548)` | `(0.707106781186548,0.707106781186547)` | epsilon |
| pairs.asy:42 | `write(sqrt((0,1)));` | `(0.707106781186547,0.707106781186548)` | `(0.707106781186548,0.707106781186547)` | epsilon |
| pairs.asy:43 | `write(sqrt((-4,0)));` | `(0,2)` | `(1.22464679914735e-16,2)` | epsilon |
| pairs.asy:52 | `write(exp((0,pi)));` | `(-1,1.22464679914735e-16)` | `23.1406926327793` | value |
| pairs.asy:53 | `write(log(z));` | `(1.6094379124341,0.927295218001612)` | `1.6094379124341` | value |
| pairs.asy:55 | `write(minbound(z, w));` | `(1,-2)` | `` | missing |
| pairs.asy:56 | `write(maxbound(z, w));` | `(3,4)` | `` | missing |

<a id="arclen"></a>
### 11. Arclength-based functions: arclength, arctime, relpoint, reltime, midpoint, waypoint

Corpus usage: `midpoint` 186, `relpoint` 165, `arclength` 96, `arctime` 0, `reltime` 2, `waypoint` 10, `WP` 0.

**Likely cause.** bezierArcLength (L27749) sums 16 chords per segment, so every arclength is short (unitcircle 6.28154 vs 6.28407; (0,0)..(1,1)..(2,0) 3.14077 vs 3.14203). asy integrates the Bezier speed adaptively to ~1e-15. relpoint (L10701), reltime (L10796), waypoint (L10789) and midpoint (L10809; second definition L18940) convert the fraction to *path time* (fraction*length) instead of to arclength, so they are only right when all segments have equal length and uniform speed: midpoint((0,0)--(4,0)--(4,3)) gives (4,0), asy (3.5,0). arctime() is missing entirely (unknown call), so point(p, arctime(p,L)) returns (0,0).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| circles_arcs.asy:23 | `write(relpoint(circle((0,0), 1), 0.125));` | `(0.707106781186547,0.707106781186548)` | `(0.707106781186548,0.707106781186547)` | epsilon |
| circles_arcs.asy:28 | `write(midpoint(arc((0,0), 1, 0, 90)));` | `(0.707106781186547,0.707106781186548)` | `(0.707106781186548,0.707106781186548)` | epsilon |
| circles_arcs.asy:43 | `write(midpoint(arc((0,0), (2,0), (-2,0))));` | `(3.67895547246895e-16,2)` | `(0,2)` | epsilon |
| mod_cse5.asy:29 | `write(WP(A--B--C));` | `(3.9142135623731,0.0857864376269046)` | `` | missing |
| mod_cse5.asy:30 | `write(WP(A--B--C, 0.25));` | `(2.06066017177982,0)` | `` | missing |
| mod_geometry.asy:36 | `write((pair)midpoint(t.AB));` | `(2,0)` | `(0,0)` | value |
| mod_graph.asy:9 | `write(arclength(g));` | `4.64675142433393` | `4.64678282501141` | value |
| mod_olympiad.asy:30 | `write(midpoint(A--B--C));` | `(4.76776695296637,0.232233047033631)` | `(5,0)` | value |
| mod_olympiad.asy:32 | `write(waypoint(A--B--C, 0.25));` | `(2.66421356237309,0)` | `(2.5,0)` | value |
| path_basic.asy:27 | `write(arctime(p, 5));` | `1.33333333333333` | `` | missing |
| path_basic.asy:28 | `write(arctime(p, 2));` | `0.5` | `` | missing |
| path_basic.asy:29 | `write(arctime(p, 100));` | `2` | `` | missing |
| path_basic.asy:30 | `write(reltime(p, 0.5));` | `0.875` | `1` | value |
| path_basic.asy:31 | `write(relpoint(p, 0.5));` | `(3.5,0)` | `(4,0)` | value |
| path_basic.asy:34 | `write(midpoint(p));` | `(3.5,0)` | `(4,0)` | value |
| path_basic.asy:113 | `write(arctime(q, 2.5));` | `2.5` | `` | missing |
| path_basic.asy:114 | `write(point(q, arctime(q, 2.5)));` | `(0.5,1)` | `(0,0)` | value |
| path_curves.asy:25 | `write(arclength(c));` | `3.14203339614772` | `3.14076992376685` | value |
| path_curves.asy:26 | `write(arctime(c, 1));` | `0.639485364166238` | `` | missing |
| path_curves.asy:58 | `write(arclength(s));` | `7.17938746487277` | `7.1774489885469` | value |
| path_curves.asy:59 | `write(arctime(s, 2.5));` | `1.10088985404615` | `` | missing |
| path_curves.asy:60 | `write(point(s, arctime(s, 2.5)));` | `(1.15964575321076,2.18981531590094)` | `(0,0)` | value |
| path_curves.asy:66 | `write(reltime(s, 0.3));` | `0.956562666395383` | `0.9` | value |
| path_curves.asy:67 | `write(relpoint(s, 0.3));` | `(0.939801342010778,1.92251784295513)` | `(0.863585736537663,1.82012730661774)` | value |
| path_ops.asy:22 | `write(relpoint(tri, 0.5));` | `(2.7961795736232,1.2038204263768)` | `(2.5,1.5)` | value |
| path_ops.asy:23 | `write(midpoint(tri));` | `(2.7961795736232,1.2038204263768)` | `(2.5,1.5)` | value |
| path_ops.asy:65 | `write(arclength(A..B..C));` | `10.5368898646063` | `10.5272801453971` | value |
| path_ops.asy:66 | `write(arctime(A..B..C, 3));` | `0.600121277278172` | `` | missing |

<a id="casts"></a>
### 12. Integer casts, rounding, int/real distinction

Corpus usage: `round` 6, `floor` 50, `ceil` 2, `(int)` 182, `pair=number` 3.

**Likely cause.** evalCast (L5760): `(int)x` uses Math.floor; asy truncates toward zero ((int)-3.7 = -3). round (L9730) is Math.round (half up); asy rounds half away from zero (round(-2.5) = -3). Floor/Ceil/Round (int-returning versions) are missing. argMatchesParamType (L4352) treats 'int' and 'real' as the same type, so overloads f(int)/f(real) always pick the first-declared match (t(1) -> "real"). A declaration `pair z = 3;` (evalVarDecl L6415) stores the number 3 instead of promoting to (3,0), so later z.x / write(z) are wrong.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| arith_int_real.asy:76 | `write((int)(-3.7));` | `-3` | `-4` | value |
| arith_int_real.asy:80 | `write(round(-2.5));` | `-3` | `-2` | value |
| arith_int_real.asy:82 | `write(round(-3.5));` | `-4` | `-3` | value |
| arith_int_real.asy:88 | `write(Floor(2.7));` | `2` | `` | missing |
| arith_int_real.asy:89 | `write(Ceil(2.1));` | `3` | `` | missing |
| arith_int_real.asy:90 | `write(Round(2.5));` | `3` | `` | missing |
| arith_int_real.asy:91 | `write(Floor(-2.7));` | `-3` | `` | missing |
| circles_arcs.asy:67 | `wpath(shift(1,1)*unitcircle);` | `len=4 / (2,1) / (2,1.5522847498308) / (1.55228474983079,2) / (1,2) / (0.447715250169207,2) / (2.46716227694479 ...` | `len=4 / (2,1) / (2,1.5522847498) / (1.5522847498,2) / (1,2) / (0.447715250200001,2) / (6.90805437544542e-16,1. ...` | epsilon |
| control_flow.asy:45 | `write(t(1));` | `int` | `real` | value |
| control_flow.asy:50 | `write(t(1#2));` | `int` | `real` | value |
| control_flow.asy:89 | `write(ri(-2.9));` | `-2` | `-3` | value |
| path_ops.asy:33 | `wpath(shift(1,1)*tri);` | `len=3 / (1,1) / (2.33333333333333,1) / (3.66666666666667,1) / (5,1) / (4,2) / (3,3) / (2,4) / (1.6666666666666 ...` | `len=3 / (1,1) / (2.33333333333334,1) / (3.66666666666666,1) / (5,1) / (4,2) / (3,3) / (2,4) / (1.6666666666666 ...` | epsilon |
| strings.asy:30 | `write(format(1/3));` | `$0.3333$` | `0.3333333333333333` | value |
| strings.asy:31 | `write(format(10));` | `$10$` | `10` | value |
| strings.asy:33 | `write(format(1e-7));` | `$1\!\times\!10^{-7}$` | `1e-7` | value |
| transforms.asy:35 | `write(inverse(shift(1,2))*(0,0));` | `(-1,-2)` | `0` | value |
| transforms.asy:38 | `write(shift(1,2));` | `(1,2,1,0,0,1)` | `{"_tag":"transform","a":1,"b":1,"c":0,"d":2,"e":0,"f":1}` | value |
| transforms.asy:41 | `write(shift(1,2)*scale(3));` | `(1,2,3,0,0,3)` | `{"_tag":"transform","a":1,"b":3,"c":0,"d":2,"e":0,"f":3}` | value |
| transforms.asy:42 | `write(shiftless(shift(1,2)*scale(3)));` | `(0,0,3,0,0,3)` | `` | missing |
| transforms.asy:43 | `write(shift(1,2).x);` | `1` | `` | missing |
| transforms.asy:44 | `write(shift(1,2).y);` | `2` | `` | missing |
| transforms.asy:59 | `write(T == shift(1,2));` | `true` | `{"_tag":"transform","a":2,"b":1,"c":0,"d":4,"e":0,"f":1}` | value |
| transforms.asy:76 | `write(shift(1,0)*reflect((0,0),(0,1)));` | `(1,0,-1,0,0,1)` | `{"_tag":"transform","a":1,"b":-1,"c":0,"d":0,"e":0,"f":1}` | value |
| types_casting.asy:3 | `write(z);` | `(3,0)` | `3` | value |
| types_casting.asy:5 | `write(w);` | `(2.5,0)` | `2.5` | value |
| types_casting.asy:67 | `write(2^52 + 1);` | `4503599627370497` | `4.5035996273705e+15` | epsilon |
| types_casting.asy:68 | `write(2^62);` | `4611686018427387904` | `4.61168601842739e+18` | epsilon |

<a id="arrays"></a>
### 13. Arrays: methods, whole-array arithmetic, sort/search, matrix ops

Corpus usage: `array append/insert/delete` 11, `sort` 2, `reverse` 143, `search` 0, `concat` 0.

**Likely cause.** evalMethodCall (L4549-4552) implements only push, pop, initialized: a.append(b), a.insert(i,x), a.delete(...) silently do nothing, and new int[4] reports initialized(0) = true. reverse(array) (L10829) is a no-op for arrays and reverse(int n) is missing. sort (L13301) sorts strings wrong (b,A,a), ignores a comparison function, and doesn't sort 2D arrays lexicographically. Missing: search, findall, concat, all, determinant, solve, inverse(real[][]), identity(n), dot(real[],real[]), uniform, abs(real[]), index-by-int-array a[sequence(0,2)], elementwise max(a,b). Whole-array ops: a == b returns 0s (should be bool[]), -a, pair[]*scalar, pair[]+pair, real[][]*real[][] and real[][]*real[] return null.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| arrays.asy:43 | `wi(a);` | `n=7 / 3 / 42 / 4 / 1 / 5 / 7 / 8` | `n=5 / 3 / 42 / 4 / 1 / 5` | value |
| arrays.asy:45 | `wi(a);` | `n=8 / 3 / 100 / 42 / 4 / 1 / 5 / 7 / 8` | `n=5 / 3 / 42 / 4 / 1 / 5` | value |
| arrays.asy:47 | `wi(a);` | `n=7 / 100 / 42 / 4 / 1 / 5 / 7 / 8` | `n=5 / 3 / 42 / 4 / 1 / 5` | value |
| arrays.asy:49 | `wi(a);` | `n=5 / 100 / 1 / 5 / 7 / 8` | `n=5 / 3 / 42 / 4 / 1 / 5` | value |
| arrays.asy:51 | `write(a.length);` | `0` | `5` | value |
| arrays.asy:55 | `wi(reverse(d));` | `n=4 / 1 / 8 / 3 / 5` | `n=4 / 5 / 3 / 8 / 1` | value |
| arrays.asy:57 | `ws(sort(new string[]{"b", "A", "a"}));` | `n=3 / A / a / b` | `n=3 / b / A / a` | value |
| arrays.asy:58 | `write(search(new int[]{1, 3, 5, 7}, 4));` | `1` | `` | missing |
| arrays.asy:59 | `write(search(new int[]{1, 3, 5, 7}, 0));` | `-1` | `` | missing |
| arrays.asy:60 | `write(search(new real[]{1, 3, 5, 7}, 7));` | `3` | `` | missing |
| arrays.asy:64 | `wi(findall(new bool[]{true, false, true}));` | `n=2 / 0 / 2` | `n=null` | value |
| arrays.asy:65 | `wi(concat(new int[]{1,2}, new int[]{3}));` | `n=3 / 1 / 2 / 3` | `n=null` | value |
| arrays.asy:76 | `wb(new int[]{1,2,3} == new int[]{1,5,3});` | `n=3 / true / false / true` | `n=3 / 0 / 0 / 0` | value |
| arrays.asy:77 | `write(all(new int[]{1,2,3} == new int[]{1,2,3}));` | `true` | `` | missing |
| arrays.asy:78 | `wi(-new int[]{1,-2});` | `n=2 / -1 / 2` | `n=null` | value |
| arrays.asy:82 | `wp(new pair[]{(1,0),(0,1)} * 2);` | `n=2 / (2,0) / (0,2)` | `n=null` | value |
| arrays.asy:83 | `wp(new pair[]{(1,0),(0,1)} + (1,1));` | `n=2 / (2,1) / (1,2)` | `n=null` | value |
| arrays.asy:90 | `wr2(identity(3));` | `rows=3 / n=3 / 1 / 0 / 0 / n=3 / 0 / 1 / 0 / n=3 / 0 / 0 / 1` | `rows=null` | value |
| arrays.asy:91 | `wr2(new real[][]{{1,2},{3,4}} * new real[][]{{0,1},{1,0}});` | `rows=2 / n=2 / 2 / 1 / n=2 / 4 / 3` | `rows=null` | value |
| arrays.asy:92 | `wr(new real[][]{{1,2},{3,4}} * new real[]{1,1});` | `n=2 / 3 / 7` | `n=null` | value |
| arrays.asy:93 | `write(determinant(new real[][]{{1,2},{3,4}}));` | `-2` | `` | missing |
| arrays.asy:94 | `wr2(inverse(new real[][]{{2,0},{0,4}}));` | `rows=2 / n=2 / 0.5 / -0 / n=2 / -0 / 0.25` | `rows=null` | value |
| arrays.asy:95 | `wr(solve(new real[][]{{2,1},{1,3}}, new real[]{3,5}));` | `n=2 / 0.8 / 1.4` | `n=null` | value |
| arrays.asy:111 | `write(big.initialized(0));` | `false` | `true` | value |
| arrays.asy:120 | `wi(reverse(4));` | `n=4 / 3 / 2 / 1 / 0` | `n=null` | value |
| arrays.asy:122 | `write(dot(new real[]{1,2,3}, new real[]{4,5,6}));` | `32` | `` | missing |
| arrays.asy:123 | `wr(abs(new real[]{-1, 2}));` | `n=2 / 1 / 2` | `n=null` | value |
| arrays.asy:124 | `wr(uniform(0, 1, 5));` | `n=6 / 0 / 0.2 / 0.4 / 0.6 / 0.8 / 1` | `n=null` | value |
| arrays.asy:125 | `write(minbound(new pair[]{(0,1),(2,-1)}));` | `(0,-1)` | `` | missing |
| arrays.asy:126 | `write(maxbound(new pair[]{(0,1),(2,-1)}));` | `(2,1)` | `` | missing |
| arrays.asy:128 | `wi2(sort(new int[][]{{2,1},{1,5},{1,2}}));` | `rows=3 / n=2 / 1 / 2 / n=2 / 1 / 5 / n=2 / 2 / 1` | `rows=3 / n=2 / 2 / 1 / n=2 / 1 / 5 / n=2 / 1 / 2` | value |
| arrays.asy:137 | `wi(h[sequence(0,2)]);` | `n=3 / 1 / 2 / 3` | `n=null` | value |
| arrays.asy:149 | `wi(max(new int[]{1,5,2}, new int[]{4,0,3}));` | `n=3 / 4 / 5 / 3` | `n=null` | value |
| arrays.asy:151 | `wi(sort(new int[]{3,1,2}, new bool(int a, int b) {return a > ...` | `n=3 / 3 / 2 / 1` | `n=3 / 1 / 2 / 3` | value |

<a id="minmax"></a>
### 14. min()/max() of paths and pictures return 0

Corpus usage: `min/max(ident)` 142.

**Likely cause.** min (L9669) / max (L9700) only handle numbers (and pictures); for a path, path[] or guide they fall through to Math.min over toNumber(...) and return 0. asy returns the bounding-box corner as a pair, including Bezier extrema (max((0,0)..(1,1)..(2,0)) = (2,1)). Also missing: minbound/maxbound(pair,pair) and (pair[]), and min/max of pair arrays.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| misc_builtins.asy:22 | `write(min(box((1,1),(0,-2))));` | `(0,-2)` | `0` | value |
| misc_builtins.asy:23 | `write(max(box((1,1),(0,-2))));` | `(1,1)` | `0` | value |
| misc_builtins.asy:25 | `write(min((0,0)--(1,5)--(-2,3)));` | `(-2,0)` | `0` | value |
| misc_builtins.asy:26 | `write(max((0,0)--(1,5)--(-2,3)));` | `(1,5)` | `0` | value |
| misc_builtins.asy:27 | `write(min((0,0)..(1,1)..(2,0)));` | `(0,0)` | `0` | value |
| misc_builtins.asy:28 | `write(max((0,0)..(1,1)..(2,0)));` | `(2,1)` | `0` | value |
| misc_builtins.asy:31 | `write(max((0,0){up}..(1,0)));` | `(1,0.5)` | `0` | value |
| path_basic.asy:37 | `write(min(p));` | `(0,0)` | `0` | value |
| path_basic.asy:38 | `write(max(p));` | `(4,3)` | `0` | value |
| path_basic.asy:94 | `write(min(pa));` | `(0,0)` | `0` | value |
| path_basic.asy:95 | `write(max(pa));` | `(1,1)` | `0` | value |
| path_basic.asy:111 | `write(ypart(max(p)));` | `3` | `0` | value |
| path_curves.asy:29 | `write(min(c));` | `(0,0)` | `0` | value |
| path_curves.asy:30 | `write(max(c));` | `(2,1)` | `0` | value |
| path_curves.asy:70 | `write(max(s));` | `(4.13525939587996,3.03017195755758)` | `0` | value |
| path_curves.asy:71 | `write(min(s));` | `(0,0)` | `0` | value |
| path_ops.asy:27 | `write(min(tri));` | `(0,0)` | `0` | value |
| path_ops.asy:28 | `write(max(tri));` | `(4,3)` | `0` | value |
| path_ops.asy:71 | `write(max(A..B..C..cycle));` | `(4.21823981937845,3.19843176949005)` | `0` | value |
| path_ops.asy:72 | `write(min(A..B..C..cycle));` | `(-0.269018091290825,-1.22604381093462)` | `0` | value |

<a id="olympiad"></a>
### 15. olympiad.asy helpers

Corpus usage: `anglemark` 134, `tangent` 35, `collinear` 0, `cyclic` 1, `concurrent` 0.

**Likely cause.** The core point functions (circumcenter, incenter, orthocenter, centroid, foot, bisectorpoint, circumradius, inradius) all match to 1e-15. Differences: anglemark (L12863) produces 6 segments where asy's produces 7 (asy's arc has the degenerate tail segment, see circle category) and different control points for the larger radius form; tangent (L12766) computes the exact tangent point, while asy's olympiad tangent intersects with the 400-gon Circle and returns (1.79981,2.40014) - HiTeXeR is "more correct" but differs by 2e-4; cyclic/collinear/ concurrent are missing (unknown call); midpoint/waypoint are arclength-based in olympiad (see arclength); circumcircle/incircle have length 400 in asy (graph's Circle).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| mod_olympiad.asy:25 | `write(foot(B, C, A));` | `(0.294117647058824,1.17647058823529)` | `(0.294117647058823,1.17647058823529)` | epsilon |
| mod_olympiad.asy:35 | `write(tangent((5,0), (0,0), 3));` | `(1.79981261143508,2.40014053000409)` | `(1.8,2.4)` | value |
| mod_olympiad.asy:36 | `write(tangent((5,0), (0,0), 3, 2));` | `(1.79981261142835,-2.40014052999514)` | `(1.8,-2.4)` | value |
| mod_olympiad.asy:37 | `write(tangent((0,5), (1,1), 2, 1));` | `(-0.932254877806244,1.51613088191364)` | `(-0.932024129630113,1.51699396759247)` | value |
| mod_olympiad.asy:40 | `write(collinear((0,0), (1,1), (3,3)));` | `true` | `` | missing |
| mod_olympiad.asy:41 | `write(collinear((0,0), (1,1), (3,3.1)));` | `false` | `` | missing |
| mod_olympiad.asy:42 | `write(concurrent((0,0),(2,2),(0,2),(2,0),(1,0),(1,2)));` | `true` | `` | missing |
| mod_olympiad.asy:43 | `wpath(rightanglemark(A, B, C));` | `len=2 / (4.76,0) / (4.70343145750508,0.0565685424949237) / (4.64686291501015,0.113137084989848) / (4.590294372 ...` | `len=2 / (4.76,0) / (4.70343145750508,0.0565685424949238) / (4.64686291501015,0.113137084989848) / (4.590294372 ...` | epsilon |
| mod_olympiad.asy:45 | `wpath(anglemark(A, B, C));` | `len=7 / (4.76,3.19744231092045e-16) / (4.76,2.1316282072803e-16) / (4.76,1.06581410364015e-16) / (4.76,0) / (4 ...` | `len=6 / (4.76,0) / (4.76,-0.13254833995939) / (4.86745166004061,-0.24) / (5,-0.24) / (5.13254833995939,-0.24)  ...` | value |
| mod_olympiad.asy:46 | `wpath(anglemark(B, A, C, 20));` | `len=3 / (0.6,0) / (0.6,0.281173975409359) / (0.406591847129114,0.517175056286899) / (0.145555756803993,0.58222 ...` | `len=3 / (0.6,0) / (0.6,0.279690828483491) / (0.408626858771254,0.514684064871573) / (0.149680861909019,0.58117 ...` | value |
| mod_olympiad.asy:50 | `write(orthocenter(D, E, F));` | `(4.85714285714286,0.142857142857142)` | `(4.85714285714286,0.142857142857143)` | epsilon |

<a id="syntax"></a>
### 16. Parse errors: constructs HiTeXeR cannot parse (whole program aborts)

Corpus usage: `struct` 6, `operator` 125, `tension` 3, `::` 4, `curl` 1, `for comma` 0, `rest args` 1.

**Likely cause.** The parser throws, so the *entire* diagram fails, not just one value. Seen: `..tension atleast x..` and `..tension a and b..` (parsePathExpr L1505, tension clause L1544-1552: `parseExpr(7)` swallows the number and then `eat(T.DOTDOT)` fails); `::` joins and `{curl c}` specifiers (parsePathExpr); rest parameters `real f(... real[] xs)` and `real f(real a ... real[] b)` (function-param parsing); `for (int i=0, j=10; ...; ++i, --j)` (parseFor L1149); function-typed variable `real sq(real x) = new real(real x){...};`; user `operator +(T a, T b)` definitions for struct types (L1650 only handles operator literals); `void operator init(...)` and `static` members inside structs (struct parser L949 skips methods by brace matching but chokes on `operator init`/`static`, "unexpected }" from L1767); and `while(true){ if(++k>4) break; }` / `while(--j>5)` which never terminate ("Loop iteration limit exceeded") because prefix ++/-- inside a condition is not evaluated as an increment.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| control_for_comma.asy:4 | `write(z);` | `15` | `` | missing |
| control_incr_in_cond.asy:4 | `write(k);` | `5` | `` | missing |
| control_incr_in_cond.asy:7 | `write(j);` | `5 / one` | `` | missing |
| control_incr_in_cond.asy:10 | `write(m);` | `1` | `` | missing |
| func_restargs.asy:3 | `write(sumall(1, 2, 3.5));` | `6.5` | `` | missing |
| func_restargs.asy:4 | `write(sumall());` | `0` | `` | missing |
| func_restargs.asy:6 | `write(mx(3));` | `3` | `` | missing |
| func_restargs.asy:7 | `write(mx(3, 7, 5));` | `7` | `` | missing |
| func_restargs.asy:8 | `write(max(new real[]{1, 4}));` | `4` | `` | missing |
| func_var_decl.asy:3 | `write(sq(1.5));` | `2.25` | `` | missing |
| operator_overload.asy:8 | `write(q.x);` | `4` | `` | missing |
| operator_overload.asy:9 | `write(q.y);` | `6` | `` | missing |
| operator_overload.asy:10 | `write((2*q).y);` | `12` | `` | missing |
| operator_overload.asy:11 | `write(mkv(1,2) == mkv(1,2));` | `true` | `` | missing |
| operator_overload.asy:12 | `write(mkv(1,2) == mkv(1,3));` | `false` | `` | missing |
| operator_overload.asy:14 | `write((1,0) ^ (0,1));` | `1` | `` | missing |
| operator_overload.asy:15 | `write((1,1)*2);` | `(2,2)` | `` | missing |
| path_syntax_01.asy:15 | `wpath((0,0)..tension atleast 1.5..(1,1));` | `len=1 / (0,0) / (0.222222222222222,0.222222222222222) / (0.777777777777778,0.777777777777778) / (1,1)` | `` | missing |
| path_syntax_02.asy:15 | `wpath((0,0)..tension 1 and 3 ..(2,1));` | `len=1 / (0,0) / (0.666666666666667,0.333333333333333) / (1.77777777777778,0.888888888888889) / (2,1)` | `` | missing |
| path_syntax_03.asy:15 | `wpath((0,0)::(1,1)::(2,0));` | `len=2 / (0,0) / (2.96059473233375e-16,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079,1 ...` | `` | missing |
| path_syntax_04.asy:15 | `wpath((0,0){curl 0}..(1,1)..{curl 0}(2,0));` | `len=2 / (0,0) / (0.202917052435201,0.489885100025833) / (0.491934610090815,1) / (1,1) / (1.50806538990918,1) / ...` | `` | missing |
| path_syntax_05.asy:15 | `wpath((0,0){curl 2}..(1,1)..(2,0));` | `len=2 / (0,0) / (-0.189589714996342,0.541816276586293) / (0.345911476779887,1.07369807686613) / (1,1) / (1.525 ...` | `` | missing |
| path_syntax_11.asy:15 | `wpath((0,0){curl 0}..(1,1));` | `len=1 / (0,0) / (0.333333333333333,0.333333333333333) / (0.666666666666667,0.666666666666667) / (1,1)` | `` | missing |
| path_syntax_12.asy:15 | `wpath((0,0)..(1,1){curl 1}..(2,0));` | `len=2 / (0,0) / (0.333333333333333,0.333333333333333) / (0.666666666666667,0.666666666666667) / (1,1) / (1.333 ...` | `` | missing |
| path_syntax_13.asy:15 | `wpath((0,0)::(1,0)::(2,1)::(3,1));` | `len=3 / (0,0) / (0.308415690042212,-0.182273213578306) / (0.691584309957788,-0.182273213578306) / (1,0) / (1.4 ...` | `` | missing |
| path_syntax_14.asy:15 | `wpath((0,0){down}::(1,-1)::{up}(2,0));` | `len=2 / (0,0) / (0,-0.552284749830794) / (0.447715250169206,-1) / (1,-1) / (1.55228474983079,-1) / (2,-0.55228 ...` | `` | missing |
| struct_init.asy:7 | `write(p.x);` | `3` | `` | missing |
| struct_init.asy:8 | `write(p.y);` | `4` | `` | missing |
| struct_init.asy:10 | `write(pts[1].y);` | `2` | `` | missing |
| struct_init.asy:16 | `write(abs(cross(T.B - T.A, T.C - T.A))/2);` | `6` | `` | missing |
| struct_static.asy:6 | `write(Stat.count);` | `0` | `` | missing |
| struct_static.asy:7 | `write(Stat.next());` | `1` | `` | missing |
| struct_static.asy:8 | `write(Stat.next());` | `2` | `` | missing |
| struct_static.asy:9 | `write(Stat.count);` | `2` | `` | missing |

<a id="hobby"></a>
### 17. Path construction: Hobby spline solver, tension, direction specifiers, ---

Corpus usage: `..cycle` 67, `---` 27, `tension` 3, `{dir}` 17, `curl` 1, `controls` 4.

**Likely cause.** evalPathExpr (L5815) / buildPathSegs (L6265). Parsing accepts `tension t` but buildPathSegs ignores the tension values (tension 2 and tension 0.75 give the default curve). `---` (tension atleast infinity) is treated as `--`; asy puts both control points *on* the nodes (visually the same line, but a `..` neighbor's direction is then taken from the straight segment: `(0,0)..(1,1)---(2,1)..(3,0)` curves in asy, HiTeXeR makes all three segments straight). `tension infinity` likewise. Direction specifiers: `(0,0){left}..(1,0)` collapses to a zero-length curve; `(0,0)..(1,0){up}..{left}(0,1)..cycle`, `(0,0)..(1,0)..{left}cycle` and `(0,0){right}..(1,1)..cycle` give different control points (and the latter two get length 1 instead of 2 - the cycle join is lost when a direction precedes `cycle`). Repeated points `(1,1)..(1,1)` should split the spline into independent pieces (asy makes the neighbors straight-line-like with curl); HiTeXeR solves through them. Many plain `..` paths match to ~1e-15 (the solver itself is right when no specifiers are involved).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| path_basic.asy:69 | `wpath((0,0)---(1,1)---(2,0));` | `len=2 / (0,0) / (0,0) / (1,1) / (1,1) / (1,1) / (2,3.94745964311167e-16) / (2,0)` | `len=2 / (0,0) / (0.333333333333333,0.333333333333333) / (0.666666666666667,0.666666666666667) / (1,1) / (1.333 ...` | value |
| path_curves.asy:46 | `wpath((0,0)..(1,1)..(1,1)..(2,0));` | `len=3 / (0,0) / (0.333333333333333,0.333333333333333) / (0.666666666666667,0.666666666666667) / (1,1) / (1,1)  ...` | `len=3 / (0,0) / (0.158930584160946,0.471174892072122) / (0.528825107927878,0.841069415839054) / (1,1) / (1,1)  ...` | value |
| path_curves.asy:51 | `wpath((0,0){left}..(1,0));` | `len=1 / (0,0) / (-4,4.89858719658941e-16) / (5,4.89858719658941e-16) / (1,0)` | `len=1 / (0,0) / (0,0) / (0,0) / (0,0)` | value |
| path_curves.asy:53 | `wpath((0,0)..(1,0){up}..{left}(0,1)..cycle);` | `len=3 / (0,0) / (0.429101089842611,-0.429101089842611) / (1,-0.363197426537715) / (1,0) / (1,0.552284749830793 ...` | `len=3 / (0,0) / (0.378372267567485,-0.504900455900204) / (0.999999999999999,-0.381219643246431) / (1,0) / (1,0 ...` | value |
| path_curves.asy:54 | `wpath((0,0)..(1,0)..{left}cycle);` | `len=2 / (0,0) / (-1.0609731522961,9.86864910777917e-17) / (0.570046772368916,-0.429953227631083) / (1,0) / (1. ...` | `len=1 / (0,0) / (1.97372982155583e-16,0) / (1.5,0) / (0,0)` | value |
| path_curves.asy:55 | `wpath((0,0){right}..(1,1)..cycle);` | `len=2 / (0,0) / (0.673550607385265,0) / (1.20809576981973,0.497612370228728) / (1,1) / (0.17292454674425,2.996 ...` | `len=1 / (0,0) / (0.21895141649746,-0.333333333333333) / (1.83333333333333,1.28104858350254) / (0,0)` | value |
| path_ops.asy:32 | `wpath(subpath(tri, 2.5, 0.5));` | `len=3 / (0.5,1.5) / (0.666666666666667,2) / (0.833333333333333,2.5) / (1,3) / (2,2) / (3,1) / (4,0) / (3.33333 ...` | `len=0 / (0,0)` | value |
| path_syntax_00.asy:15 | `wpath((0,0)..tension 2 ..(1,1)..(2,0));` | `len=2 / (0,0) / (0.136228067783766,0.194553843467716) / (0.805446156532284,0.863771932216233) / (1,1) / (1.658 ...` | `len=2 / (0,0) / (-1.97372982155583e-16,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079, ...` | value |
| path_syntax_08.asy:15 | `wpath((0,0)..(1,1)---(2,1)..(3,0));` | `len=3 / (0,0) / (0,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1,1) / (2,1) / (2,1) / (2.55228474983 ...` | `len=3 / (0,0) / (0.333333333333333,0.333333333333333) / (0.666666666666667,0.666666666666667) / (1,1) / (1.333 ...` | value |
| path_syntax_09.asy:15 | `wpath((0,0)..tension 0.75..(1,1)..(2,0));` | `len=2 / (0,0) / (-0.516649780362899,0.86705020518658) / (0.13294979481342,1.5166497803629) / (1,1) / (1.411254 ...` | `len=2 / (0,0) / (-1.97372982155583e-16,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079, ...` | value |
| path_syntax_10.asy:15 | `wpath((0,0)..tension infinity..(1,1));` | `len=1 / (0,0) / (0,0) / (1,1) / (1,1)` | `len=1 / (0,0) / (0.333333333333333,0.333333333333333) / (0.666666666666667,0.666666666666667) / (1,1)` | value |

<a id="pens"></a>
### 18. Pens: attribute getters and color functions

Corpus usage: `pen getter` 3, `cmyk` 1, `colors` 22.

**Likely cause.** linewidth(pen) (L11439) and fontsize(pen) (L11453) always build a new pen; asy overloads them as getters (linewidth(p) returns real). colors(), colorspace(), linetype(pen), linecap/linejoin getters are missing, so nothing about a pen can be read back. See also the named-color table below: named colors match asy (within 8-bit quantization) except cmyk(pen) (L11518) turns red into white and interp(pen,pen,t) (L9922) returns 0.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| pens.asy:15 | `write(linewidth(defaultpen));` | `0.5` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:16 | `write(linewidth(linewidth(2)));` | `2` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:17 | `write(linewidth(red + 3));` | `3` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:18 | `write(linewidth(red + linewidth(0.5)));` | `0.5` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:19 | `write(linewidth(black + 1.5bp));` | `1.5` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:20 | `write(linewidth(currentpen));` | `0.5` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:24 | `wr(colors(red));` | `n=3 / 1 / 0 / 0` | `n=null` | value |
| pens.asy:25 | `wr(colors(green));` | `n=3 / 0 / 1 / 0` | `n=null` | value |
| pens.asy:26 | `wr(colors(blue));` | `n=3 / 0 / 0 / 1` | `n=null` | value |
| pens.asy:27 | `wr(colors(gray(0.5)));` | `n=1 / 0.5` | `n=null` | value |
| pens.asy:28 | `wr(colors(rgb(0.1, 0.2, 0.3)));` | `n=3 / 0.1 / 0.2 / 0.3` | `n=null` | value |
| pens.asy:29 | `wr(colors(0.5*red));` | `n=3 / 0.5 / 0 / 0` | `n=null` | value |
| pens.asy:30 | `wr(colors(red + blue));` | `n=3 / 1 / 0 / 1` | `n=null` | value |
| pens.asy:31 | `wr(colors(red + green));` | `n=3 / 1 / 1 / 0` | `n=null` | value |
| pens.asy:32 | `wr(colors(0.5*red + 0.5*blue));` | `n=3 / 0.5 / 0 / 0.5` | `n=null` | value |
| pens.asy:33 | `wr(colors(white));` | `n=1 / 1` | `n=null` | value |
| pens.asy:34 | `wr(colors(black));` | `n=1 / 0` | `n=null` | value |
| pens.asy:35 | `wr(colors(lightgray));` | `n=1 / 0.9` | `n=null` | value |
| pens.asy:36 | `wr(colors(darkgreen));` | `n=3 / 0 / 0.25 / 0` | `n=null` | value |
| pens.asy:37 | `wr(colors(orange));` | `n=3 / 1 / 0.5 / 0` | `n=null` | value |
| pens.asy:38 | `wr(colors(purple));` | `n=3 / 0.5 / 0 / 1` | `n=null` | value |
| pens.asy:39 | `wr(colors(cyan));` | `n=3 / 0 / 1 / 1` | `n=null` | value |
| pens.asy:40 | `wr(colors(magenta));` | `n=3 / 1 / 0 / 1` | `n=null` | value |
| pens.asy:41 | `wr(colors(yellow));` | `n=3 / 1 / 1 / 0` | `n=null` | value |
| pens.asy:42 | `wr(colors(brown));` | `n=3 / 0.5 / 0 / 0` | `n=null` | value |
| pens.asy:43 | `wr(colors(pink));` | `n=3 / 1 / 0.75 / 1` | `n=null` | value |
| pens.asy:44 | `wr(colors(lightblue));` | `n=3 / 0.5 / 0.5 / 1` | `n=null` | value |
| pens.asy:45 | `wr(colors(heavyblue));` | `n=3 / 0 / 0 / 0.75` | `n=null` | value |
| pens.asy:46 | `wr(colors(mediumgray));` | `n=1 / 0.75` | `n=null` | value |
| pens.asy:47 | `wr(colors(RGB(255, 128, 0)));` | `n=3 / 1 / 0.501960784313725 / 0` | `n=null` | value |
| pens.asy:48 | `wr(colors(rgb("ff8000")));` | `n=3 / 1 / 0.5 / 0` | `n=null` | value |
| pens.asy:49 | `wr(colors(cmyk(red)));` | `n=4 / 0 / 1 / 1 / 0` | `n=null` | value |
| pens.asy:50 | `wr(colors(interp(red, blue, 0.25)));` | `n=3 / 0.75 / 0 / 0.25` | `n=null` | value |
| pens.asy:51 | `wr(colors(gray));` | `n=1 / 0.5` | `n=null` | value |
| pens.asy:53 | `write(colorspace(red));` | `rgb` | `` | missing |
| pens.asy:54 | `write(colorspace(gray(0.3)));` | `gray` | `` | missing |
| pens.asy:55 | `write(colorspace(cmyk(red)));` | `cmyk` | `` | missing |
| pens.asy:56 | `wr(colors(mediumblue));` | `n=3 / 0.25 / 0.25 / 1` | `n=null` | value |
| pens.asy:57 | `wr(colors(olive));` | `n=3 / 0.5 / 0.5 / 0` | `n=null` | value |
| pens.asy:58 | `wr(colors(royalblue));` | `n=3 / 0 / 0.5 / 1` | `n=null` | value |
| pens.asy:59 | `wr(colors(deepgreen));` | `n=3 / 0 / 0.5 / 0` | `n=null` | value |
| pens.asy:60 | `wr(colors(palered));` | `n=3 / 1 / 0.75 / 0.75` | `n=null` | value |
| pens.asy:61 | `wr(colors(lightred));` | `n=3 / 1 / 0.5 / 0.5` | `n=null` | value |
| pens.asy:62 | `wr(colors(green + red + blue));` | `n=3 / 1 / 1 / 1` | `n=null` | value |
| pens.asy:63 | `wr(colors(red*0.3 + green));` | `n=3 / 0.3 / 1 / 0` | `n=null` | value |
| pens.asy:64 | `write(opacity(opacity(0.4)));` | `0.4` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":12,"opacity":0,"linecap"` | value |
| pens.asy:65 | `write(opacity(red));` | `1` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":12,"opacity":0,"linecap"` | value |
| pens.asy:66 | `write(linewidth(1 + red));` | `1` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:67 | `write(linewidth(2 + linewidth(3)));` | `3` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0,"linestyle":null,"fontsize":12,"opacity":1,"linecap":n` | value |
| pens.asy:68 | `wr(linetype(dashed));` | `n=2 / 8 / 8` | `n=null` | value |
| pens.asy:69 | `wr(linetype(dotted));` | `n=2 / 0 / 4` | `n=null` | value |
| pens.asy:70 | `write(linetype(solid));` | `` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":"dashed","fontsize":12,"opacity":1,"line` | extra |
| pens.asy:71 | `wr(linetype(dashdotted));` | `n=4 / 8 / 8 / 0 / 8` | `n=null` | value |
| pens.asy:72 | `wr(linetype(longdashed));` | `n=2 / 24 / 8` | `n=null` | value |
| pens.asy:73 | `write(linecap(squarecap));` | `0` | `{"_tag":"pen","r":0,"g":0,"b":0,"linewidth":0.5,"linestyle":null,"fontsize":12,"opacity":1,"linecap"` | value |
| pens.asy:74 | `write(linejoin(roundjoin));` | `1` | `` | missing |
| pens.asy:75 | `wr(colors(rgb(red)));` | `n=3 / 1 / 0 / 0` | `n=null` | value |
| pens.asy:76 | `wr(colors(gray(red)));` | `n=1 / 0.299` | `n=null` | value |
| pens.asy:77 | `wr(colors(lightgreen));` | `n=3 / 0.5 / 1 / 0.5` | `n=null` | value |
| pens.asy:78 | `wr(colors(darkblue));` | `n=3 / 0 / 0 / 0.25` | `n=null` | value |
| pens.asy:79 | `wr(colors(darkgray));` | `n=1 / 0.05` | `n=null` | value |
| pens.asy:80 | `wr(colors(lightyellow));` | `n=3 / 1 / 1 / 0.5` | `n=null` | value |
| pens.asy:81 | `wr(colors(red + 0.5*green));` | `n=3 / 1 / 0.5 / 0` | `n=null` | value |
| pens.asy:82 | `wr(colors(1.5*gray(0.4)));` | `n=1 / 0.6` | `n=null` | value |

<a id="cse5"></a>
### 19. cse5.asy helpers

Corpus usage: `CR` 4, `IP` 20, `CP` 0, `OP` 0, `WP` 0, `L` 8, `d` 20.

**Likely cause.** d(), CP(), L(), OP(), WP(), commonpoints() are missing (unknown call). CR (L12487) returns a 4-segment circle / 1-segment arc (asy: graph Circle/Arc with 400 segments). IP(a, b, n) (L12367) ignores the index n.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| mod_cse5.asy:17 | `write(d(A, B));` | `4` | `` | missing |
| mod_cse5.asy:18 | `write(d(A, C));` | `3.16227766016838` | `` | missing |
| mod_cse5.asy:22 | `wpath(L(A, B));` | `len=1 / (-2.4,0) / (0.533333333333332,0) / (3.46666666666667,0) / (6.4,0)` | `len=0 / (0,0)` | value |
| mod_cse5.asy:23 | `wpath(L(A, B, 0.5, 1));` | `len=1 / (-2,0) / (1.33333333333333,0) / (4.66666666666667,0) / (8,0)` | `len=0 / (0,0)` | value |
| mod_cse5.asy:24 | `wpath(L(1, A, B));` | `len=1 / (-0.6,0) / (1.13333333333333,0) / (2.86666666666667,0) / (4.6,0)` | `len=0 / (0,0)` | value |

<a id="dirpath"></a>
### 20. dir(path, t) / dir(path)

Corpus usage: `dir(path,t)` 11.

**Likely cause.** _dirOnPath (L10402) returns the outgoing derivative direction at integer times. asy's dir(p,t) at a node returns unit(dir(p,t,-1)+dir(p,t,+1)), the average of incoming and outgoing directions, so dir((0,0)--(4,0)--(4,3),1) is (0.7071,0.7071), not (0,1). For cyclic paths t=0 and t=length must also average across the cycle join. dir(p) with no time is dir(p, length(p)) in asy (L9765 branch uses time 0). When the first derivative vanishes (control point equals node, e.g. `(0,0){left}..(1,0)` or arcs with degenerate tails) asy falls back to the second/third derivative; HiTeXeR returns (0,0).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| circles_arcs.asy:24 | `write(dir(circle((0,0), 1), 0.5));` | `(-0.707106781186547,0.707106781186548)` | `(-0.707106781186547,0.707106781186547)` | epsilon |
| circles_arcs.asy:58 | `write(dir(arc((0,0), 1, 0, 90), 0));` | `(-2.0102366124817e-16,1)` | `(0,1)` | epsilon |
| circles_arcs.asy:85 | `write(dir(arc((0,0), 1, 0, 120), 1));` | `(-1,2.0102366124817e-16)` | `(-1,0)` | epsilon |
| mod_olympiad.asy:63 | `write(dir(A--B--C, 1));` | `(0.38268343236509,0.923879532511287)` | `(-0.707106781186547,0.707106781186548)` | value |
| path_basic.asy:40 | `write(dir(p, 1));` | `(0.707106781186547,0.707106781186547)` | `(0,1)` | value |
| path_basic.asy:43 | `write(dir(p));` | `(0,1)` | `(1,0)` | value |
| path_basic.asy:61 | `write(dir(q, 0));` | `(0.707106781186547,-0.707106781186547)` | `(1,0)` | value |
| path_basic.asy:62 | `write(dir(q, 4));` | `(0.707106781186547,-0.707106781186547)` | `(0,-1)` | value |
| path_curves.asy:23 | `write(dir(c, 0));` | `(2.0102366124817e-16,1)` | `(-3.82856869892695e-16,1)` | epsilon |
| path_curves.asy:24 | `write(dir(c, 1));` | `(1,1.00511830624085e-16)` | `(1,-4.0204732249634e-16)` | epsilon |
| path_ops.asy:24 | `write(dir(tri, 1));` | `(0.38268343236509,0.923879532511287)` | `(-0.707106781186548,0.707106781186548)` | value |
| path_ops.asy:25 | `write(dir(tri, 0));` | `(0.584710284663765,-0.811242185175561)` | `(1,0)` | value |
| path_ops.asy:26 | `write(dir(tri, 3));` | `(0.584710284663765,-0.811242185175561)` | `(-0.316227766016838,-0.948683298050514)` | value |

<a id="structs"></a>
### 21. Structs

Corpus usage: `struct` 6, `struct method` 4.

**Likely cause.** The struct parser (L949) skips method bodies, so member functions are silently undefined (p.norm() prints nothing and p.scaleby(2) has no effect). Field initializers (`int a = 5; real b = a*2;`) are not applied (d.a prints nothing). A declared-but-unassigned struct variable `Seg s3;` is null in HiTeXeR but asy auto-allocates it (s3 == null is false).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| struct_fields.asy:12 | `write(s3 == null);` | `false` | `true` | value |
| struct_fields.asy:24 | `write(d.a);` | `5` | `` | missing |
| struct_fields.asy:25 | `write(d.b);` | `10` | `` | missing |
| struct_fields.asy:26 | `write(d.p);` | `(1,2)` | `` | missing |
| struct_fields.asy:28 | `write(d.b);` | `10` | `` | missing |
| struct_methods.asy:10 | `write(p.norm());` | `5` | `` | missing |
| struct_methods.asy:12 | `write(p.x);` | `6` | `3` | value |
| struct_methods.asy:13 | `write(p.topair());` | `(6,8)` | `` | missing |
| struct_methods.asy:21 | `write(c.get());` | `2` | `` | missing |
| struct_methods.asy:24 | `write(c.n);` | `3` | `` | missing |

<a id="transform"></a>
### 22. transform values: inverse, ==, field access, shiftless

Corpus usage: `inverse` 1, `shiftless` 0.

**Likely cause.** Applying transforms to pairs and paths and composing them all match. Missing: inverse(transform) (unknown call - returns 0, so inverse(T)*z is 0), shiftless(), transform fields t.x t.y t.xx t.xy t.yx t.yy. `T == S` on transforms evaluates to a transform (looks like it falls into the multiply path in evalBinary L3399) instead of bool. write(transform) prints the internal object (asy prints (x,y,xx,xy,yx,yy)).

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| transforms.asy:34 | `write(inverse(R)*R*(1,2));` | `(1,2)` | `(0,0)` | value |
| transforms.asy:36 | `write(inverse(scale(2))*(4,4));` | `(2,2)` | `0` | value |
| transforms.asy:37 | `write(R);` | `(0,0,0.866025403784439,-0.5,0.5,0.866025403784439)` | `{"_tag":"transform","a":0,"b":0.8660254037844387,"c":-0.49999999999999994,"d":0,"e":0.49999999999999` | value |
| transforms.asy:39 | `write(scale(2));` | `(0,0,2,0,0,2)` | `{"_tag":"transform","a":0,"b":2,"c":0,"d":0,"e":0,"f":2}` | value |
| transforms.asy:40 | `write(identity());` | `(0,0,1,0,0,1)` | `{"_tag":"transform","a":0,"b":1,"c":0,"d":0,"e":0,"f":1}` | value |
| transforms.asy:45 | `write(scale(3).xx);` | `3` | `` | missing |
| transforms.asy:46 | `write(rotate(90).xy);` | `-1` | `` | missing |
| transforms.asy:47 | `write(rotate(90).yx);` | `1` | `` | missing |
| transforms.asy:48 | `write(scale(2,5).yy);` | `5` | `` | missing |
| transforms.asy:51 | `wpath(scale(2)*((0,0)..(1,1)..(2,0)));` | `len=2 / (0,0) / (5.9211894646675e-16,1.10456949966159) / (0.895430500338413,2) / (2,2) / (3.10456949966159,2)  ...` | `len=2 / (0,0) / (-3.94745964311167e-16,1.10456949966159) / (0.895430500338413,2) / (2,2) / (3.10456949966158,2 ...` | epsilon |
| transforms.asy:53 | `write(rotate(45, (1,0))*(2,0));` | `(1.70710678118655,0.707106781186548)` | `(1.70710678118655,0.707106781186547)` | epsilon |
| transforms.asy:58 | `write(U == T);` | `false` | `{"_tag":"transform","a":-1,"b":6.123233995736766e-17,"c":-1,"d":3,"e":1,"f":6.123233995736766e-17}` | value |
| transforms.asy:66 | `write(inverse(rotate(45)*scale(2))*(1,1));` | `(0.707106781186547,0)` | `0` | value |
| transforms.asy:67 | `wpath(scale(0.5)*unitsquare);` | `len=4 / (0,0) / (0.166666666666667,0) / (0.333333333333333,0) / (0.5,0) / (0.5,0.166666666666667) / (0.5,0.333 ...` | `len=4 / (0,0) / (0.166666666666666,0) / (0.333333333333334,0) / (0.5,0) / (0.5,0.166666666666667) / (0.5,0.333 ...` | epsilon |
| transforms.asy:68 | `wpath(rotate(45)*unitsquare);` | `len=4 / (0,0) / (0.235702260395516,0.235702260395516) / (0.471404520791032,0.471404520791032) / (0.70710678118 ...` | `len=4 / (0,0) / (0.235702260395515,0.235702260395515) / (0.471404520791033,0.471404520791033) / (0.70710678118 ...` | epsilon |
| transforms.asy:69 | `wpath(slant(0.5)*unitsquare);` | `len=4 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1.16666666666667,0.333333333333333) / ...` | `len=4 / (0,0) / (0.333333333333332,0) / (0.666666666666668,0) / (1,0) / (1.16666666666667,0.333333333333333) / ...` | epsilon |
| transforms.asy:74 | `write(scale(2)*rotate(90));` | `(0,0,1.22464679914735e-16,-2,2,1.22464679914735e-16)` | `{"_tag":"transform","a":0,"b":1.2246467991473532e-16,"c":-2,"d":0,"e":2,"f":1.2246467991473532e-16}` | value |
| transforms.asy:75 | `write(rotate(90)*scale(2,1));` | `(0,0,1.22464679914735e-16,-1,2,6.12323399573677e-17)` | `{"_tag":"transform","a":0,"b":1.2246467991473532e-16,"c":-1,"d":0,"e":2,"f":6.123233995736766e-17}` | value |
| transforms.asy:81 | `write(inverse(S)*(S*(3,4)));` | `(3,4)` | `0` | value |

<a id="write"></a>
### 23. write() output format (debug-only; affects nothing drawn)

Corpus usage: `write(` 5.

**Likely cause.** _fmtAsyVal / write (L13450/L13464, only active with HTX_WRITE). asy prints arrays as "i:\tvalue" lines, 2D arrays as tab-separated rows, separates multiple write arguments with a tab and promotes a following int to a pair after a pair argument, prints bools with a trailing space, paths as "(0,0)--(1,1)" / "..controls..", transforms as (x,y,xx,xy,yx,yy), -0 as "-0" and small/large reals in %g style (1e-05). Only matters for tooling that diffs write() output, but fixing it would let this suite compare whole paths/arrays directly.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| arith_int_real.asy:48 | `write(-0.0);` | `-0` | `0` | format |
| arith_int_real.asy:54 | `write(1e-5);` | `1e-05` | `0.00001` | format |
| write_format.asy:2 | `write(new int[]{3, 1, 4});` | `0:	3 / 1:	1 / 2:	4` | `3 / 1 / 4` | value |
| write_format.asy:3 | `write(new real[]{1.5, 2});` | `0:	1.5 / 1:	2` | `1.5 / 2` | value |
| write_format.asy:4 | `write(new pair[]{(0,0), (1,2)});` | `0:	(0,0) / 1:	(1,2)` | `(0,0) / (1,2)` | value |
| write_format.asy:5 | `write(new string[]{"a", "bc"});` | `0:	a / 1:	bc` | `a / bc` | value |
| write_format.asy:6 | `write(new bool[]{true, false});` | `0:	true / 1:	false` | `true / false` | value |
| write_format.asy:7 | `write(new int[][]{{1,2},{3,4}});` | `1	2 / 3	4` | `1 / 2 / 3 / 4` | value |
| write_format.asy:8 | `write(new real[][]{{0.5},{1,2,3}});` | `0.5 / 1	2	3` | `0.5 / 1 / 2 / 3` | value |
| write_format.asy:10 | `write(new int[2]);` | `0: / 1:` | `0 / 0` | value |
| write_format.asy:11 | `write(1, 2);` | `1	2` | `12` | value |
| write_format.asy:12 | `write(1.5, (1,2));` | `(1.5,0)	(1,2)` | `1.5(1,2)` | value |
| write_format.asy:15 | `write((1,2), 3);` | `(1,2)	(3,0)` | `(1,2)3` | value |
| write_format.asy:18 | `write("s=", new int[]{1,2});` | `s= / 0:	1 / 1:	2` | `s=1 / 2` | value |

<a id="epsilon"></a>
### 24. Numerical noise (agrees to 1e-9 but not to the last digit)

**Likely cause.** Mostly two sources: (1) the truncated circle kappa (see circle category) and (2) HiTeXeR computing Sin/Cos/ dir/rotate via Math.cos(x*pi/180), where asy uses exact values at multiples of 30/45/90 degrees (Cos(90) is 0 in asy, 6.1e-17 in HiTeXeR; rotate(45)*(1,0) differs in the last digit). Harmless for drawing, but it breaks exact comparisons like dir(45) == (sqrt(2)/2,sqrt(2)/2) and x == 0 tests in user code.

| file:line | source | asy (expected) | HiTeXeR (got) | kind |
|---|---|---|---|---|
| circles_arcs.asy:15 | `wpath(unitcircle);` | `len=4 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-0.552284749830793,1) / (-1,0.5522847 ...` | `len=4 / (1,0) / (1,0.552284749799999) / (0.552284749799999,1) / (0,1) / (-0.5522847498,1) / (-0.99999999999999 ...` | epsilon |
| circles_arcs.asy:17 | `write(point(unitcircle, 0.5));` | `(0.707106781186547,0.707106781186547)` | `(0.707106781175,0.707106781175)` | epsilon |
| circles_arcs.asy:31 | `wpath(arc((0,0), 1, 0, 270));` | `len=3 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-0.552284749830793,1) / (-1,0.5522847 ...` | `len=3 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-0.552284749830793,1) / (-1,0.5522847 ...` | epsilon |
| circles_arcs.asy:34 | `wpath(arc((0,0), 1, -45, 45));` | `len=2 / (0.707106781186547,-0.707106781186547) / (0.888071187457699,-0.526142374915397) / (1,-0.27614237491539 ...` | `len=2 / (0.707106781186548,-0.707106781186548) / (0.888071187457699,-0.526142374915397) / (1,-0.27614237491539 ...` | epsilon |
| circles_arcs.asy:38 | `wpath(arc((0,0), 1, 90, 0, CCW));` | `len=3 / (-7.3579109449379e-16,1) / (-0.552284749830794,1) / (-0.999999999999999,0.552284749830793) / (-1,0) /  ...` | `len=3 / (0,1) / (-0.552284749830794,1) / (-1,0.552284749830794) / (-1,0) / (-1,-0.552284749830793) / (-0.55228 ...` | epsilon |
| circles_arcs.asy:45 | `wpath(arc((0,0), 1, 0, 180));` | `len=2 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-0.552284749830793,1) / (-1,0.5522847 ...` | `len=2 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-0.552284749830793,1) / (-1,0.5522847 ...` | epsilon |
| circles_arcs.asy:46 | `wpath(arc((0,0), 3, 45, 135));` | `len=2 / (2.12132034355964,2.12132034355964) / (1.57842712474619,2.66421356237309) / (0.828427124746191,3) / (0 ...` | `len=2 / (2.12132034355964,2.12132034355964) / (1.57842712474619,2.6642135623731) / (0.82842712474619,3) / (0,3 ...` | epsilon |
| circles_arcs.asy:47 | `wpath(ellipse((0,0), 2, 1));` | `len=4 / (2,0) / (2,0.552284749830794) / (1.10456949966159,1) / (0,1) / (-1.10456949966159,1) / (-2,0.552284749 ...` | `len=4 / (2,0) / (2,0.552284749799999) / (1.1045694996,1) / (0,1) / (-1.1045694996,1) / (-2,0.552284749800002)  ...` | epsilon |
| circles_arcs.asy:50 | `wpath(ellipse((1,1), 3, 1));` | `len=4 / (4,1) / (4,1.5522847498308) / (2.65685424949238,2) / (1,2) / (-0.65685424949238,2) / (-2,1.55228474983 ...` | `len=4 / (4,1) / (4,1.5522847498) / (2.65685424939999,2) / (1,2) / (-0.656854249399998,2) / (-2,1.5522847498) / ...` | epsilon |
| circles_arcs.asy:68 | `wpath(scale(2)*unitcircle);` | `len=4 / (2,0) / (2,1.10456949966159) / (1.10456949966159,2) / (0,2) / (-1.10456949966159,2) / (-2,1.1045694996 ...` | `len=4 / (2,0) / (2,1.1045694996) / (1.1045694996,2) / (0,2) / (-1.1045694996,2) / (-2,1.1045694996) / (-2,0) / ...` | epsilon |
| circles_arcs.asy:69 | `wpath(xscale(2)*unitcircle);` | `len=4 / (2,0) / (2,0.552284749830794) / (1.10456949966159,1) / (0,1) / (-1.10456949966159,1) / (-2,0.552284749 ...` | `len=4 / (2,0) / (2,0.552284749799999) / (1.1045694996,1) / (0,1) / (-1.1045694996,1) / (-2,0.552284749800002)  ...` | epsilon |
| circles_arcs.asy:75 | `write(point(unitcircle, 0.33333));` | `(0.863473288631751,0.504714703621202)` | `(0.863473288624908,0.504714703607517)` | epsilon |
| circles_arcs.asy:84 | `write(point(arc((0,0), 1, 0, 120), 0.5));` | `(0.707106781186547,0.707106781186547)` | `(0.707106781186548,0.707106781186548)` | epsilon |
| intersections.asy:45 | `wr(times(c, 1));` | `n=2 / 0.670199889113601 / 3.3298001108864` | `n=2 / 0.670199889103374 / 3.32980011089663` | epsilon |
| path_basic.asy:49 | `wpath(p);` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,1) / (4,2) / (4,3)` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,0.999999999999999) / (4,2) / (4,3)` | epsilon |
| path_basic.asy:51 | `wpath(q);` | `len=4 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1,0.333333333333333) / (1,0.666666666 ...` | `len=4 / (0,0) / (0.333333333333332,0) / (0.666666666666668,0) / (1,0) / (1,0.333333333333333) / (1,0.666666666 ...` | epsilon |
| path_basic.asy:67 | `wpath(p--(0,0));` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,1) / (4,2) / (4,3) / (2.6666666666666 ...` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,0.999999999999999) / (4,2) / (4,3) /  ...` | epsilon |
| path_basic.asy:68 | `wpath(p & (4,3)--(0,3));` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,1) / (4,2) / (4,3) / (2.6666666666666 ...` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,0.999999999999999) / (4,2) / (4,3) /  ...` | epsilon |
| path_basic.asy:77 | `wpath(box((0,0), (2,1)));` | `len=4 / (0,0) / (0.666666666666667,0) / (1.33333333333333,0) / (2,0) / (2,0.333333333333333) / (2,0.6666666666 ...` | `len=4 / (0,0) / (0.666666666666664,0) / (1.33333333333334,0) / (2,0) / (2,0.333333333333333) / (2,0.6666666666 ...` | epsilon |
| path_basic.asy:78 | `wpath(unitsquare);` | `len=4 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1,0.333333333333333) / (1,0.666666666 ...` | `len=4 / (0,0) / (0.333333333333332,0) / (0.666666666666668,0) / (1,0) / (1,0.333333333333333) / (1,0.666666666 ...` | epsilon |
| path_basic.asy:79 | `wpath(polygon(4));` | `len=4 / (0.707106781186548,-0.707106781186548) / (0.707106781186548,-0.235702260395516) / (0.707106781186548,0 ...` | `len=4 / (0.707106781186548,-0.707106781186547) / (0.707106781186547,-0.235702260395518) / (0.707106781186548,0 ...` | epsilon |
| path_basic.asy:80 | `wpath(polygon(3));` | `len=3 / (0.866025403784439,-0.5) / (0.577350269189626,-1.48029736616688e-16) / (0.288675134594813,0.5) / (6.12 ...` | `len=3 / (0.866025403784439,-0.5) / (0.577350269189625,9.86864910777917e-16) / (0.288675134594814,0.49999999999 ...` | epsilon |
| path_basic.asy:108 | `wpath((0,0)--(1,0)--cycle);` | `len=2 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (0.666666666666667,0) / (0.33333333333 ...` | `len=2 / (0,0) / (0.333333333333334,0) / (0.666666666666666,0) / (1,0) / (0.666666666666667,0) / (0.33333333333 ...` | epsilon |
| path_basic.asy:116 | `wpath(p--cycle);` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (4,1) / (4,2) / (4,3) / (2.6666666666666 ...` | `len=3 / (0,0) / (1.33333333333334,0) / (2.66666666666666,0) / (4,0) / (4,1) / (4,2) / (4,3) / (2.6666666666666 ...` | epsilon |
| path_curves.asy:16 | `wpath(c);` | `len=2 / (0,0) / (2.96059473233375e-16,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079,1 ...` | `len=2 / (0,0) / (-1.97372982155583e-16,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079, ...` | epsilon |
| path_curves.asy:21 | `write(point(c, 0.5));` | `(0.292893218813452,0.707106781186547)` | `(0.292893218813452,0.707106781186548)` | epsilon |
| path_curves.asy:31 | `wpath((0,0)..(1,1)..(2,0)..cycle);` | `len=3 / (0,0) / (-0.0663122518007629,0.549145268452589) / (0.418882507934723,1) / (1,1) / (1.58111749206528,1) ...` | `len=3 / (0,0) / (-0.0663122518007619,0.54914526845259) / (0.418882507934722,1) / (1,1) / (1.58111749206528,0.9 ...` | epsilon |
| path_curves.asy:32 | `wpath((0,0)..(2,0)..(2,2)..(0,2)..cycle);` | `len=4 / (0,0) / (0.552284749830794,-0.552284749830793) / (1.44771525016921,-0.552284749830793) / (2,0) / (2.55 ...` | `len=4 / (0,0) / (0.55228474983079,-0.552284749830793) / (1.44771525016921,-0.552284749830793) / (2,0) / (2.552 ...` | epsilon |
| path_curves.asy:33 | `wpath((0,0){up}..(1,1)..{down}(2,0));` | `len=2 / (0,0) / (0,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079,1) / (2,0.5522847498 ...` | `len=2 / (0,0) / (0,0.552284749830793) / (0.447715250169206,1) / (1,1) / (1.55228474983079,1) / (2,0.5522847498 ...` | epsilon |
| path_curves.asy:35 | `wpath((0,0){right}..{left}(1,1));` | `len=1 / (0,0) / (1.16299600217377,0) / (1.63438325698407,1) / (1,1)` | `len=1 / (0,0) / (1.16299600217377,-1.97372982155583e-16) / (1.63438325698407,1) / (1,1)` | epsilon |
| path_curves.asy:36 | `wpath((0,0)--(1,0)..(2,1)..(3,0)--(4,0));` | `len=4 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1,0.552284749830793) / (1.44771525016 ...` | `len=4 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1,0.552284749830793) / (1.44771525016 ...` | epsilon |
| path_curves.asy:38 | `wpath((0,0){up}..{right}(1,1)--(2,1));` | `len=2 / (0,0) / (0,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.33333333333333,1) / (1.666666666666 ...` | `len=2 / (0,0) / (0,0.552284749830793) / (0.447715250169206,1) / (1,1) / (1.33333333333333,1) / (1.666666666666 ...` | epsilon |
| path_curves.asy:39 | `wpath((0,0)..(1,2)..(3,3)..(4,1)..(6,0));` | `len=4 / (0,0) / (0.24906806216455,0.705572076676586) / (0.584983175957461,1.37740230426241) / (1,2) / (1.49613 ...` | `len=4 / (0,0) / (0.24906806216455,0.705572076676586) / (0.584983175957461,1.37740230426241) / (1,2) / (1.49613 ...` | epsilon |
| path_curves.asy:40 | `wpath((0,0)..(5,1)..(6,5)..(2,3)..cycle);` | `len=4 / (0,0) / (0.596019913515811,-1.75867745151187) / (3.15089772915731,-0.997929231980625) / (5,1) / (6.239 ...` | `len=4 / (0,0) / (0.596019913515802,-1.75867745151187) / (3.15089772915732,-0.997929231980622) / (5,1) / (6.239 ...` | epsilon |
| path_curves.asy:41 | `wpath((0,0)..(1,0)..(1,1)..(0,1)..cycle);` | `len=4 / (0,0) / (0.276142374915397,-0.276142374915397) / (0.723857625084603,-0.276142374915397) / (1,0) / (1.2 ...` | `len=4 / (0,0) / (0.276142374915395,-0.276142374915397) / (0.723857625084605,-0.276142374915397) / (1,0) / (1.2 ...` | epsilon |
| path_curves.asy:43 | `wpath((0,0)..(1,1){right}..(2,0));` | `len=2 / (0,0) / (0,0.552284749830794) / (0.447715250169206,1) / (1,1) / (1.55228474983079,1) / (2,0.5522847498 ...` | `len=2 / (0,0) / (0,0.552284749830793) / (0.447715250169206,1) / (1,1) / (1.55228474983079,1) / (2,0.5522847498 ...` | epsilon |
| path_curves.asy:44 | `wpath((0,0)..{up}(1,1){down}..(2,0));` | `len=2 / (0,0) / (0.552284749830794,0) / (1,0.447715250169206) / (1,1) / (1,0.447715250169207) / (1.44771525016 ...` | `len=2 / (0,0) / (0.552284749830793,0) / (1,0.447715250169206) / (1,1) / (0.999999999999999,0.447715250169207)  ...` | epsilon |
| path_curves.asy:45 | `wpath((1,0)..(0,1)..(-1,0)..(0,-1)..cycle);` | `len=4 / (1,0) / (1,0.552284749830794) / (0.552284749830794,1) / (0,1) / (-0.552284749830793,1) / (-1,0.5522847 ...` | `len=4 / (1,0) / (1,0.552284749830792) / (0.552284749830792,1) / (0,1) / (-0.552284749830793,1) / (-0.999999999 ...` | epsilon |
| path_curves.asy:47 | `wpath((0,0)..(0,0)..(1,0));` | `len=2 / (0,0) / (0,0) / (0,0) / (0,0) / (0.333333333333333,0) / (0.666666666666666,0) / (1,0)` | `len=2 / (0,0) / (0,0) / (0,0) / (0,0) / (0.333333333333334,-1.09564014614029e-32) / (0.666666666666666,4.08215 ...` | epsilon |
| path_curves.asy:49 | `wpath((0,0){up}..(2,0));` | `len=1 / (0,0) / (0,1.33333333333333) / (2,1.33333333333333) / (2,0)` | `len=1 / (0,0) / (1.97372982155583e-16,1.33333333333333) / (2,1.33333333333333) / (2,0)` | epsilon |
| path_curves.asy:50 | `wpath((0,0){up}..{up}(2,0));` | `len=1 / (0,0) / (0,1.33333333333333) / (2,-1.33333333333333) / (2,0)` | `len=1 / (0,0) / (1.97372982155583e-16,1.33333333333333) / (2,-1.33333333333333) / (2,0)` | epsilon |
| path_curves.asy:52 | `wpath((0,0)--(1,0){up}..(2,1));` | `len=2 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1,0.552284749830793) / (1.44771525016 ...` | `len=2 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (0.999999999999999,0.552284749830793)  ...` | epsilon |
| path_curves.asy:56 | `wpath((0,0)..(1,0)..(2,0));` | `len=2 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1.33333333333333,0) / (1.666666666666 ...` | `len=2 / (0,0) / (0.333333333333333,0) / (0.666666666666667,4.08215599715784e-17) / (1,0) / (1.33333333333333,- ...` | epsilon |
| path_ops.asy:29 | `wpath(tri);` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,1) / (2,2) / (1,3) / (0.6666666666666 ...` | `len=3 / (0,0) / (1.33333333333334,0) / (2.66666666666666,0) / (4,0) / (3,1) / (2,2) / (1,3) / (0.6666666666666 ...` | epsilon |
| path_ops.asy:34 | `wpath(rotate(90)*tri);` | `len=3 / (0,0) / (8.16431199431569e-17,1.33333333333333) / (1.63286239886314e-16,2.66666666666667) / (2.4492935 ...` | `len=3 / (0,0) / (8.1643119943157e-17,1.33333333333334) / (1.63286239886314e-16,2.66666666666666) / (2.44929359 ...` | epsilon |
| path_ops.asy:35 | `wpath(scale(2)*tri);` | `len=3 / (0,0) / (2.66666666666667,0) / (5.33333333333333,0) / (8,0) / (6,2) / (4,4) / (2,6) / (1.3333333333333 ...` | `len=3 / (0,0) / (2.66666666666667,0) / (5.33333333333333,0) / (8,0) / (6,2) / (4.00000000000001,3.999999999999 ...` | epsilon |
| path_ops.asy:36 | `wpath(reflect(A, B)*tri);` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,-1) / (2,-2) / (1,-3) / (0.6666666666 ...` | `len=3 / (0,0) / (1.33333333333334,0) / (2.66666666666666,0) / (4,0) / (3,-1) / (2,-2) / (1,-3) / (0.6666666666 ...` | epsilon |
| path_ops.asy:41 | `wpath(two);` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,1) / (2,2) / (1,3)` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,0.999999999999999) / (2,2) / (1,3)` | epsilon |
| path_ops.asy:45 | `wpath(open--cycle);` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,1) / (2,2) / (1,3) / (0.6666666666666 ...` | `len=3 / (0,0) / (1.33333333333334,0) / (2.66666666666666,0) / (4,0) / (3,1) / (2,2) / (1,3) / (0.6666666666666 ...` | epsilon |
| path_ops.asy:46 | `wpath(A--B..C);` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,1) / (2,2) / (1,3)` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,0.999999999999999) / (2,2) / (1,3)` | epsilon |
| path_ops.asy:47 | `wpath(A..B--C);` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,1) / (2,2) / (1,3)` | `len=2 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,0.999999999999999) / (2,2) / (1,3)` | epsilon |
| path_ops.asy:48 | `wpath(A..B..C);` | `len=2 / (0,0) / (0.781413094231582,-1.71568488031534) / (3.21858690576842,-1.71568488031535) / (4,0) / (4.8681 ...` | `len=2 / (0,0) / (0.781413094231583,-1.71568488031534) / (3.21858690576842,-1.71568488031534) / (4,0) / (4.8681 ...` | epsilon |
| path_ops.asy:49 | `wpath(A..B..C..cycle);` | `len=3 / (0,0) / (0.898147333916374,-1.64554948324355) / (3.23357988572633,-1.62386472338343) / (4,0) / (4.8787 ...` | `len=3 / (0,0) / (0.898147333916376,-1.64554948324355) / (3.23357988572633,-1.62386472338343) / (4,0) / (4.8787 ...` | epsilon |
| path_ops.asy:50 | `wpath(A{up}..B);` | `len=1 / (0,0) / (0,2.66666666666667) / (4,2.66666666666667) / (4,0)` | `len=1 / (0,0) / (3.94745964311167e-16,2.66666666666667) / (4,2.66666666666667) / (4,0)` | epsilon |
| path_ops.asy:51 | `wpath(A..{down}B);` | `len=1 / (0,0) / (0,2.66666666666667) / (4,2.66666666666667) / (4,0)` | `len=1 / (0,0) / (3.94745964311167e-16,2.66666666666667) / (4,2.66666666666667) / (4,0)` | epsilon |
| path_ops.asy:53 | `wpath(A{N}..B..{S}C);` | `len=2 / (0,0) / (3.94745964311167e-16,2.24984145781261) / (2.62999493641725,-0.231575246027697) / (4,0) / (11. ...` | `len=2 / (0,0) / (3.94745964311167e-16,2.24984145781261) / (2.62999493641725,-0.231575246027696) / (4,0) / (11. ...` | epsilon |
| path_ops.asy:54 | `wpath(C..A{right}..B);` | `len=2 / (1,3) / (-1.46653490972941,4.84990118229706) / (-3.08316863716176,0) / (0,0) / (1.33333333333333,0) /  ...` | `len=2 / (1,3) / (-1.46653490972941,4.84990118229706) / (-3.08316863716176,7.89491928622333e-16) / (0,0) / (1.3 ...` | epsilon |
| path_ops.asy:55 | `wpath((0,0)..(1,1)..(2,0)..(3,1));` | `len=3 / (0,0) / (-0.260939989336762,0.629964861222303) / (0.370035138777697,1.26093998933676) / (1,1) / (1.452 ...` | `len=3 / (0,0) / (-0.260939989336763,0.629964861222303) / (0.370035138777697,1.26093998933676) / (1,1) / (1.452 ...` | epsilon |
| path_ops.asy:56 | `wpath((0,0)..(1,1)..(2,0)..(3,1)..cycle);` | `len=4 / (0,0) / (-0.42101782277864,0.544477724156273) / (0.240517122752603,1.36294820085202) / (1,1) / (1.4378 ...` | `len=4 / (0,0) / (-0.421017822778641,0.544477724156272) / (0.240517122752604,1.36294820085203) / (1,1) / (1.437 ...` | epsilon |
| path_ops.asy:57 | `wpath((0,0)..(2,1)..(4,0)..(2,-1)..cycle);` | `len=4 / (0,0) / (-1.97372982155583e-16,0.822526843640285) / (1.04238740385266,1) / (2,1) / (2.95761259614734,1 ...` | `len=4 / (0,0) / (-2.96059473233375e-15,0.822526843640283) / (1.04238740385266,1) / (2,1) / (2.95761259614734,0 ...` | epsilon |
| path_ops.asy:60 | `wpath((0,0)--(1,0)..(2,1)--(3,1));` | `len=3 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1.33333333333333,0.333333333333333) / ...` | `len=3 / (0,0) / (0.333333333333333,0) / (0.666666666666667,0) / (1,0) / (1.33333333333333,0.333333333333334) / ...` | epsilon |
| path_ops.asy:61 | `wpath((0,0)..(1,0)..(2,0)..(2,1));` | `len=3 / (0,0) / (0.330099814488245,0.0656609355714428) / (0.669900185511754,0.0656609355714428) / (1,0) / (1.3 ...` | `len=3 / (0,0) / (0.330099814488246,0.0656609355714428) / (0.669900185511754,0.0656609355714428) / (1,0) / (1.3 ...` | epsilon |
| path_ops.asy:63 | `wpath(A--B--C..cycle);` | `len=3 / (0,0) / (1.33333333333333,0) / (2.66666666666667,0) / (4,0) / (3,1) / (2,2) / (1,3) / (0.6666666666666 ...` | `len=3 / (0,0) / (1.33333333333334,0) / (2.66666666666666,0) / (4,0) / (3,1) / (2,2) / (1,3) / (0.6666666666666 ...` | epsilon |
| path_ops.asy:64 | `wpath(A..B..C--cycle);` | `len=3 / (0,0) / (0.781413094231582,-1.71568488031534) / (3.21858690576842,-1.71568488031535) / (4,0) / (4.8681 ...` | `len=3 / (0,0) / (0.781413094231584,-1.71568488031534) / (3.21858690576842,-1.71568488031534) / (4,0) / (4.8681 ...` | epsilon |

## Named pen colors (colors-check.js)

80 pen expressions compared as RGB; HiTeXeR stores 8-bit channels so differences up to 0.5/255 are ignored. 2 mismatch:

| pen | asy (rgb) | HiTeXeR (rgb) |
|---|---|---|
| `cmyk(red)` | 1, 0, 0 | 1, 1, 1 |
| `interp(red,blue,0.25)` | 0.75, 0, 0.25 | n/a (0
) |

## Per-file totals

| file | checks | value/missing | epsilon | format | HiTeXeR threw |
|---|---|---|---|---|---|
| arith_int_real.asy | 93 | 7 | 0 | 2 |  |
| arrays.asy | 106 | 34 | 0 | 0 |  |
| bool_compare.asy | 41 | 7 | 0 | 0 |  |
| circles_arcs.asy | 66 | 29 | 22 | 0 |  |
| control_flow.asy | 63 | 3 | 0 | 0 |  |
| control_for_comma.asy | 1 | 1 | 0 | 0 | yes |
| control_incr_in_cond.asy | 3 | 3 | 0 | 0 | yes |
| func_restargs.asy | 5 | 5 | 0 | 0 | yes |
| func_var_decl.asy | 1 | 1 | 0 | 0 | yes |
| intersections.asy | 59 | 41 | 1 | 0 |  |
| math_funcs.asy | 82 | 10 | 2 | 0 |  |
| misc_builtins.asy | 73 | 22 | 4 | 0 |  |
| mod_cse5.asy | 15 | 15 | 0 | 0 |  |
| mod_geometry.asy | 35 | 11 | 0 | 0 |  |
| mod_graph.asy | 39 | 17 | 2 | 0 |  |
| mod_olympiad.asy | 52 | 19 | 4 | 0 |  |
| operator_overload.asy | 7 | 7 | 0 | 0 | yes |
| pairs.asy | 72 | 6 | 4 | 0 |  |
| path_basic.asy | 100 | 46 | 14 | 0 |  |
| path_curves.asy | 57 | 26 | 23 | 0 |  |
| path_ops.asy | 53 | 13 | 23 | 0 |  |
| path_syntax_00.asy | 1 | 1 | 0 | 0 |  |
| path_syntax_01.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_02.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_03.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_04.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_05.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_06.asy | 1 | 0 | 0 | 0 |  |
| path_syntax_07.asy | 1 | 0 | 0 | 0 |  |
| path_syntax_08.asy | 1 | 1 | 0 | 0 |  |
| path_syntax_09.asy | 1 | 1 | 0 | 0 |  |
| path_syntax_10.asy | 1 | 1 | 0 | 0 |  |
| path_syntax_11.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_12.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_13.asy | 1 | 1 | 0 | 0 | yes |
| path_syntax_14.asy | 1 | 1 | 0 | 0 | yes |
| pens.asy | 68 | 67 | 0 | 0 |  |
| strings.asy | 67 | 26 | 3 | 6 |  |
| struct_fields.asy | 16 | 5 | 0 | 0 |  |
| struct_init.asy | 4 | 4 | 0 | 0 | yes |
| struct_methods.asy | 5 | 5 | 0 | 0 |  |
| struct_static.asy | 4 | 4 | 0 | 0 | yes |
| transforms.asy | 64 | 22 | 5 | 0 |  |
| types_casting.asy | 84 | 2 | 2 | 0 |  |
| write_format.asy | 20 | 12 | 0 | 0 |  |

## How to run

```
node refactor/conformance/run.js                 # all tests vs git HEAD asy-interp.js (real asy output is cached in .cache/)
node refactor/conformance/run.js arrays pairs    # selected tests
node refactor/conformance/run.js --working       # test the working-tree asy-interp.js
node refactor/conformance/colors-check.js        # named pen colors
node refactor/conformance/corpus-counts.js       # refresh corpus-counts.json (about a minute)
node refactor/conformance/build-report.js        # regenerate this file
```

Tests live in `tests/*.asy`; every one runs cleanly under asy 3.06 (lines asy rejects were removed).
Output is attributed to source lines by a `write("@@L<n>")` marker the runner splices onto each line
that starts with `write(` or one of the printing helpers (`wi wr wb ws wp wi2 wr2 wpath`), so loop and
if bodies containing writes must be braced. `wpath(g)` prints a path as its nodes plus control points
recovered from point(g, i+1/3) and point(g, i+2/3), so it only depends on point() and length().
Constructs that make HiTeXeR throw at parse time live in their own small files so they only fail themselves.
