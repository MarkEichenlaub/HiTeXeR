'use strict';
// Builds REPORT.md from results.json (run.js), results-colors.json
// (colors-check.js) and corpus-counts.json (corpus-counts.js).
//   node refactor/conformance/build-report.js
// Each mismatch is assigned to the first root-cause category whose `match`
// accepts it. Categories are ordered in the report by corpus usage (the max
// number of corpus diagrams using any of the category's constructs).
const fs = require('fs');
const path = require('path');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json'), 'utf8'));
const colors = fs.existsSync(path.join(__dirname, 'results-colors.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'results-colors.json'), 'utf8')) : [];
const CC = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus-counts.json'), 'utf8'));
const cnt = (k) => CC.counts['[' + k + ']'] || CC.counts[k] || 0;
const snap = (R.interpreter || '').replace(/\\/g, '/');

// Line numbers below refer to asy-interp.js at the commit in `snap`.
const CATS = [
  {id: 'syntax', title: 'Parse errors: constructs HiTeXeR cannot parse (whole program aborts)',
   keys: ['struct', 'operator', 'tension', '::', 'curl', 'for comma', 'rest args'],
   match: m => m.fileThrew,
   cause: `The parser throws, so the *entire* diagram fails, not just one value. Seen: \`..tension atleast x..\`
and \`..tension a and b..\` (parsePathExpr L1505, tension clause L1544-1552: \`parseExpr(7)\` swallows the number and
then \`eat(T.DOTDOT)\` fails); \`::\` joins and \`{curl c}\` specifiers (parsePathExpr); rest parameters
\`real f(... real[] xs)\` and \`real f(real a ... real[] b)\` (function-param parsing); \`for (int i=0, j=10; ...; ++i, --j)\`
(parseFor L1149); function-typed variable \`real sq(real x) = new real(real x){...};\`; user \`operator +(T a, T b)\`
definitions for struct types (L1650 only handles operator literals); \`void operator init(...)\` and \`static\`
members inside structs (struct parser L949 skips methods by brace matching but chokes on \`operator init\`/\`static\`,
"unexpected }" from L1767); and \`while(true){ if(++k>4) break; }\` / \`while(--j>5)\` which never terminate
("Loop iteration limit exceeded") because prefix ++/-- inside a condition is not evaluated as an increment.`},
  {id: 'intersect', title: 'Path intersections are only accurate to ~1e-4',
   keys: ['intersectionpoint', 'intersectionpoints', 'IP', 'IPs', 'intersect', 'buildcycle'],
   match: m => (/intersect|IPs?\(|buildcycle|commonpoints|point\(cyc/.test(m.src) || m.file === 'intersections.asy') && !/extension/.test(m.src) && m.kind !== 'epsilon',
   cause: `bezierBezierIntersect (L27763) and bezierBezierIntersectFirstT (L27830) recurse on bounding boxes with
\`tol = 1e-4\` and return the midpoint of the converged boxes, so every intersection point/time is off by up to
~1e-4 (e.g. (2,2) comes back as (1.99992,1.99995)). asy's intersect() converges to ~1e-15 (its fuzz is
realEpsilon-scaled). Fix: after the box recursion, polish with Newton on (B1(s)-B2(t)) or recurse until the boxes
are < 1e-12 (asy's default fuzz). Also: intersectionpoints(circle, x=1 tangent line) returns 8 duplicates instead
of asy's 1 (no de-duplication of hits near segment joints); intersections(sq, (1,-1)--(1,3)) and the
intersections(path, pair, pair) (line) overload are missing/empty; intersect() (L12163) returns only the first
hit found in segment order and intersectionpoints order can differ from asy's sort by time in the first path.
buildcycle (L10877) inherits the imprecision (corners off by 1e-4). times(path, pair) (L12091) treats the pair
as an x value; asy's times(p, z) solves for the *point* z (here returns 0 and 2 for (1,0) on the circle).`},
  {id: 'extension', title: 'extension() of parallel lines (non-parallel extension() is exact)',
   keys: ['extension'],
   match: m => /extension/.test(m.src),
   cause: `extension (L12080) returns (0,0) for parallel lines; asy returns (infinity, infinity) where infinity =
5.64380309412236e+102 (cbrt(realMax)). Diagrams then draw to the origin instead of off-page.`},
  {id: 'circlearc', title: 'circle()/Circle()/arc()/Arc()/ellipse() construction and parameterization',
   keys: ['Circle', 'arc', 'circle', 'circumcircle', 'incircle', 'Arc', 'ellipse', 'CR', 'point(circle'],
   match: m => /(^|\W)(arc|Arc|circle|Circle|ellipse|circumcircle|incircle|unitcircle|CR|CP)\(|unitcircle/.test(m.src) && m.kind !== 'epsilon',
   cause: `(1) plain circle(c,r) (L9973) and graph's Circle(c,r[,n]) (L9979) both call makeCirclePath (L26976),
which builds asy's 4-segment Bezier circle but tags it \`_circle\` with a virtual 400-node parameterization, and
_pointOnPath (L10421) then maps point(g,t) to angle t/400*360deg. That is right for graph's Circle (asy:
length 400, a 400-node \`..\` polygon) but wrong for plain circle(): point(circle((1,2),3),1.5) should be on the
4-node Bezier at t=1.5 ((-1.121,4.121)), not 1.35deg past the start. Meanwhile length() still returns 4 for both,
so length(Circle(...)), length(circumcircle(...)) (olympiad uses graph's Circle) and point(C, length(C)/2)
disagree with asy. Circle(c,r,n) ignores n.
(2) The Bezier kappa is truncated: \`K = 0.5522847498\` (L9280 unitcircle, L4704, L20654, L26977) vs asy's
0.552284749830793 (4/3*(sqrt(2)-1)), which shows up as 1e-11 errors in every circle point.
(3) arc(c,r,a1,a2) (L9985 -> makeArcPath L26993) builds its own Bezier; asy builds arcs as a subpath of the
4-node unit circle at arctime-derived times, so asy's arc(0,90) has length 2 (a real quarter plus a degenerate
zero-length tail segment) and interior arcs start/end on the *Bezier* circle, e.g. arc((0,0),1,30,150) starts at
(0.866169630634359,0.500083269410626), HiTeXeR (0.863470685147584,0.504719148072945) which is also not the exact
dir(30). Node count / times differ for every arc, so point(arc,t), relpoint and dir(arc,t) mismatch.
arc(c,r,45,45) should be a full circle (asy) but is empty; arc(...,CW) and the 3-point arc(c,A,B) forms
follow the same construction. graph's Arc(c,r,a1,a2[,n]) (L10304) returns a 1-segment Bezier (asy: n=400
segments of a \`..\` polygon; Arc(...,3) = 3 segments).`},
  {id: 'arclen', title: 'Arclength-based functions: arclength, arctime, relpoint, reltime, midpoint, waypoint',
   keys: ['midpoint', 'relpoint', 'arclength', 'arctime', 'reltime', 'waypoint', 'WP'],
   match: m => /arclength|arctime|relpoint|reltime|midpoint|waypoint|WP\(/.test(m.src),
   cause: `bezierArcLength (L27749) sums 16 chords per segment, so every arclength is short (unitcircle 6.28154 vs
6.28407; (0,0)..(1,1)..(2,0) 3.14077 vs 3.14203). asy integrates the Bezier speed adaptively to ~1e-15.
relpoint (L10701), reltime (L10796), waypoint (L10789) and midpoint (L10809; second definition L18940) convert
the fraction to *path time* (fraction*length) instead of to arclength, so they are only right when all segments
have equal length and uniform speed: midpoint((0,0)--(4,0)--(4,3)) gives (4,0), asy (3.5,0). arctime() is missing
entirely (unknown call), so point(p, arctime(p,L)) returns (0,0).`},
  {id: 'dirpath', title: 'dir(path, t) / dir(path)',
   keys: ['dir(path,t)'],
   match: m => /dir\((p|q|c|s|tri|A--B--C|A\.\.B|arc\(|circle\(|unitcircle)/.test(m.src) || /dir\(A--B/.test(m.src),
   cause: `_dirOnPath (L10402) returns the outgoing derivative direction at integer times. asy's dir(p,t) at a node
returns unit(dir(p,t,-1)+dir(p,t,+1)), the average of incoming and outgoing directions, so dir((0,0)--(4,0)--(4,3),1)
is (0.7071,0.7071), not (0,1). For cyclic paths t=0 and t=length must also average across the cycle join.
dir(p) with no time is dir(p, length(p)) in asy (L9765 branch uses time 0). When the first derivative vanishes
(control point equals node, e.g. \`(0,0){left}..(1,0)\` or arcs with degenerate tails) asy falls back to the
second/third derivative; HiTeXeR returns (0,0).`},
  {id: 'minmax', title: 'min()/max() of paths and pictures return 0',
   keys: ['min/max(ident)'],
   match: m => /\b(min|max)\(/.test(m.src) && (m.htx[0] === '0' || m.kind === 'missing' || m.htx.length === 0),
   cause: `min (L9669) / max (L9700) only handle numbers (and pictures); for a path, path[] or guide they fall
through to Math.min over toNumber(...) and return 0. asy returns the bounding-box corner as a pair, including
Bezier extrema (max((0,0)..(1,1)..(2,0)) = (2,1)). Also missing: minbound/maxbound(pair,pair) and
(pair[]), and min/max of pair arrays.`},
  {id: 'hobby', title: 'Path construction: Hobby spline solver, tension, direction specifiers, ---',
   keys: ['..cycle', '---', 'tension', '{dir}', 'curl', 'controls'],
   match: m => /^path_(curves|syntax|ops)/.test(m.file) && /wpath|write\(\(/.test(m.src) && m.kind === 'value' || /tension|---|curl|::|controls/.test(m.src),
   cause: `evalPathExpr (L5815) / buildPathSegs (L6265). Parsing accepts \`tension t\` but buildPathSegs ignores
the tension values (tension 2 and tension 0.75 give the default curve). \`---\` (tension atleast infinity) is
treated as \`--\`; asy puts both control points *on* the nodes (visually the same line, but a \`..\` neighbor's
direction is then taken from the straight segment: \`(0,0)..(1,1)---(2,1)..(3,0)\` curves in asy, HiTeXeR makes
all three segments straight). \`tension infinity\` likewise. Direction specifiers: \`(0,0){left}..(1,0)\`
collapses to a zero-length curve; \`(0,0)..(1,0){up}..{left}(0,1)..cycle\`, \`(0,0)..(1,0)..{left}cycle\` and
\`(0,0){right}..(1,1)..cycle\` give different control points (and the latter two get length 1 instead of 2 -
the cycle join is lost when a direction precedes \`cycle\`). Repeated points \`(1,1)..(1,1)\` should split the
spline into independent pieces (asy makes the neighbors straight-line-like with curl); HiTeXeR solves through
them. Many plain \`..\` paths match to ~1e-15 (the solver itself is right when no specifiers are involved).`},
  {id: 'subpath', title: 'Path queries: subpath/reverse edge cases, missing path builtins',
   keys: ['point', 'reverse', 'subpath', 'inside', 'windingnumber', 'beginpoint', 'endpoint', 'precontrol'],
   match: m => /subpath|reverse|length\(e\)|size\(|cyclic\(|beginpoint|endpoint|precontrol|postcontrol|straight|windingnumber|inside|accel|radius|dirtime|mintimes|maxtimes/.test(m.src) && !/^arrays|^strings/.test(m.file),
   cause: `subpath (L11283) clamps a and b to [0,n] and returns an empty path when a > b; asy returns the reversed
subpath (subpath(p,2,1) = (4,3)--(4,0)). For cyclic paths asy wraps times outside [0,n] (subpath(q,3,5) has 2
segments, subpath(tri,2.5,0.5) goes backwards through the corners); HiTeXeR clamps. length(nullpath) is -1 in
asy (HiTeXeR 0). size(path), cyclic(path), beginpoint/endpoint, precontrol/postcontrol, accel, radius,
dirtime, straight, piecewisestraight, windingnumber, mintimes/maxtimes are not implemented (unknown call).
inside (L12472) returns false for a point on the boundary; asy's inside() uses the nonzero winding rule with
boundary points counted inside.`},
  {id: 'graph', title: 'graph module: graph(), Circle/Arc sampling, interpolation',
   keys: ['graph', 'Circle', 'Arc', 'polargraph'],
   match: m => m.file === 'mod_graph.asy',
   cause: `graph(f,a,b[,n]) (L14612) samples the right nodes (node positions and length() match) but the
segments between samples are curves that follow f, whatever join was requested. asy's default join is \`--\`
(straight chords): point(graph(f,-1,1,n=4), 1.5) is the chord midpoint (-0.25,0.125) in asy but f(-0.25) =
(-0.25,0.0625) in HiTeXeR, and sin sampled at 10 points gives 0.6984 vs 0.7069 between nodes. With
\`operator ..\` asy runs the Hobby spline through the samples (point(g3,50.5) = (0.50501,0.25504)), HiTeXeR
returns the exact f value. Polar/parametric graphs behave the same way. Circle(c,r,n)/Arc(c,r,a1,a2,n): see circle category (asy builds n-segment \`..\` polygons).`},
  {id: 'olympiad', title: 'olympiad.asy helpers',
   keys: ['anglemark', 'tangent', 'collinear', 'cyclic', 'concurrent'],
   match: m => m.file === 'mod_olympiad.asy',
   cause: `The core point functions and cyclic/collinear/concurrent match. Remaining: anglemark produces 6
segments where asy's produces 7 (asy's arc has a degenerate tail segment, see circle category) and slightly
different control points for the larger radius form. tangent follows olympiad's construction (Bezier circle and 400-node Arc
intersections), so it matches asy's (1.79981,2.40014) rather than the exact (1.8,2.4).`},
  {id: 'cse5', title: 'cse5.asy helpers',
   keys: ['CR', 'IP', 'CP', 'OP', 'WP', 'L', 'd'],
   match: m => m.file === 'mod_cse5.asy',
   cause: `d, CP, L, OP, WP (arclength-based), commonpoints and IP(a, b, n) are implemented; what remains is
intersection-point noise against the 400-node CR circles (see intersections).`},
  {id: 'geometry', title: 'geometry.asy module (point/line/circle/triangle structs)',
   keys: ['import geometry'],
   match: m => m.file === 'mod_geometry.asy',
   cause: `circle.C/.r, triangle A/B/C, VA/VB/VC (vertices, usable by foot()), AB/BC/CA (segments), t.a()/b()/c()
and t.alpha()/beta()/gamma(), circumcircle(t)/incircle(t) all match. Only 1e-15 noise remains.`},
  {id: 'casts', title: 'Integer casts, rounding, int/real distinction',
   keys: ['round', 'floor', 'ceil', '(int)', 'pair=number'],
   match: m => /\(int\)|round\(|Round|Floor|Ceil|ri\(|t\(1|pair z = |write\(z\)|write\(w\)/.test(m.src) || (m.file === 'types_casting.asy'),
   cause: `evalCast (L5760): \`(int)x\` uses Math.floor; asy truncates toward zero ((int)-3.7 = -3). round (L9730) is
Math.round (half up); asy rounds half away from zero (round(-2.5) = -3). Floor/Ceil/Round (int-returning
versions) are missing. argMatchesParamType (L4352) treats 'int' and 'real' as the same type, so overloads
f(int)/f(real) always pick the first-declared match (t(1) -> "real"). A declaration \`pair z = 3;\`
(evalVarDecl L6415) stores the number 3 instead of promoting to (3,0), so later z.x / write(z) are wrong.`},
  {id: 'operators', title: 'Operators: bool ^, compound #= %= ^=, prefix --',
   keys: ['#', '%'],
   match: m => m.file === 'bool_compare.asy' || m.file === 'control_incr_in_cond.asy',
   cause: `evalBinaryValues (L4104): \`^\` on bools is Math.pow (true^true = 1) instead of xor. evalAssignment
(L6483) only maps '+=','-=','*=','/=' (L6492/6529/6539/6553); \`#=\`, \`%=\`, \`^=\` silently do nothing.
Prefix \`--k\` (parse L1612) returns the old value / does not decrement (write(--k) gave 1, asy 0), and
++/-- inside an if/while condition do not update the variable (infinite loop).`},
  {id: 'transform', title: 'transform values: inverse, ==, field access, shiftless',
   keys: ['inverse', 'shiftless'],
   match: m => m.file === 'transforms.asy',
   cause: `inverse(transform), shiftless(), ==/!= and the x y xx xy yx yy fields match, and write(transform)
prints asy's (x,y,xx,xy,yx,yy). Remaining differences are last-digit noise.`},
  {id: 'strings', title: 'Strings: string()/format() number formatting and string functions',
   keys: ['string', 'format(', 'string(real,n)'],
   match: m => m.file === 'strings.asy',
   cause: `string(real[, digits]), the (string) cast and format() go through a C printf emulation (exact
round-half-even ties, %g/%e/%f/%d/%i/%x/%o, flags and width) plus asy's format() post-processing (trailing-zero
and spurious-sign removal, TeX exponent "\\!\\times\\!10^{e}" after a '$'); format(real) uses "$%.4g$".
find(s,t,pos), rfind, replace (all occurrences), reverse, insert, erase, downcase, upcase, stripsuffix match.
Remaining: write(1, 2) separates its arguments with a tab (write category).`},
  {id: 'arrays', title: 'Arrays: methods, whole-array arithmetic, sort/search, matrix ops',
   keys: ['array append/insert/delete', 'sort', 'reverse', 'search', 'concat'],
   match: m => m.file === 'arrays.asy',
   cause: `Array methods append/insert/delete, reverse(T[])/reverse(int), sort (strings, less predicate, 2D rows),
search, findall, concat, all, identity(n), determinant, solve, inverse(real[][]), dot(real[],real[]), uniform,
abs(real[]), a[int[]], element-wise min/max, bool[] results of comparisons, bool[] & |, bool[] ? a : b, unary
minus, pair[] arithmetic and matrix products match. Remaining: new int[4] reports initialized(0) = true (arrays
are allocated with values).`},
  {id: 'pens', title: 'Pens: attribute getters and color functions',
   keys: ['pen getter', 'cmyk', 'colors'],
   match: m => m.file === 'pens.asy',
   cause: `linewidth/fontsize/opacity/linetype/linecap/linejoin read the value back from a pen; colors() and
colorspace() track gray/rgb/cmyk/invisible; cmyk(pen), gray(pen), rgb(pen) and interp(pen,pen,t) convert as
asy does, and named colors carry plain_pens.asy's exact fractions. Remaining: fontsize(defaultpen) is 12 (asy:
12pt = 11.955bp; the default is kept at 12 because every label is calibrated to it) and rgb("ff8000") gives
0x80/255 where asy uses byteinv (0x80/256).`},
  {id: 'pairs', title: 'Pair functions',
   keys: ['cross', 'minbound', 'maxbound', 'abs2'],
   match: m => m.file === 'pairs.asy',
   cause: `cross(pair,pair), complex exp/log, abs2, minbound, maxbound match. Remaining: sqrt((-4,0)) and similar give
1e-16 noise instead of exact 0 (asy special-cases the branch).`},
  {id: 'constants', title: 'Built-in constants and misc builtins',
   keys: ['Npt', 'Degrees', 'hypot'],
   match: m => m.file === 'misc_builtins.asy' || m.file === 'math_funcs.asy',
   cause: `pt = 72/72.27, realEpsilon/realMin, arrowlength, arrowangle, legendmargin, log1p, expm1, fabs, hypot,
erf, Jn, Yn, identity(real), Degrees() match. Remaining: intMax is 2^31-1 (asy's 64-bit 9223372036854775805 is
not representable as a JS number); labelmargin is only the function labelmargin(pen), not also the variable;
dir(45) == (sqrt(2)/2, sqrt(2)/2) is false because dir computes cos(a*pi/180) instead of asy's
exactly-rounded degree sin/cos.`},
  {id: 'structs', title: 'Structs',
   keys: ['struct', 'struct method'],
   match: m => /^struct_|^operator_|^func_|^control_/.test(m.file),
   cause: `The struct parser (L949) skips method bodies, so member functions are silently undefined (p.norm() prints
nothing and p.scaleby(2) has no effect). Field initializers (\`int a = 5; real b = a*2;\`) are not applied
(d.a prints nothing). A declared-but-unassigned struct variable \`Seg s3;\` is null in HiTeXeR but asy
auto-allocates it (s3 == null is false).`},
  {id: 'write', title: 'write() output format (debug-only; affects nothing drawn)',
   keys: ['write('],
   match: m => m.file === 'write_format.asy' || /write\([^()]*,[^()]*\);$/.test(m.src) || m.kind === 'format',
   cause: `_fmtAsyVal / write (L13450/L13464, only active with HTX_WRITE). asy prints arrays as "i:\\tvalue" lines,
2D arrays as tab-separated rows, separates multiple write arguments with a tab and promotes a following int to
a pair after a pair argument, prints bools with a trailing space, paths as "(0,0)--(1,1)" / "..controls..",
transforms as (x,y,xx,xy,yx,yy), -0 as "-0" and small/large reals in %g style (1e-05). Only matters for
tooling that diffs write() output, but fixing it would let this suite compare whole paths/arrays directly.`},
  {id: 'epsilon', title: 'Numerical noise (agrees to 1e-9 but not to the last digit)',
   keys: [],
   match: m => m.kind === 'epsilon',
   cause: `Mostly two sources: (1) the truncated circle kappa (see circle category) and (2) HiTeXeR computing Sin/Cos/
dir/rotate via Math.cos(x*pi/180), where asy uses exact values at multiples of 30/45/90 degrees (Cos(90) is 0 in asy,
6.1e-17 in HiTeXeR; rotate(45)*(1,0) differs in the last digit). Harmless for drawing, but it breaks exact
comparisons like dir(45) == (sqrt(2)/2,sqrt(2)/2) and x == 0 tests in user code.`},
  {id: 'other', title: 'Uncategorized', keys: [], match: () => true, cause: ''},
];

// ---------------------------------------------------------------- assign
const all = [];
for (const f of R.results) {
  for (const m of f.mismatches) {
    const mm = Object.assign({file: f.file, fileThrew: !!f.htxThrown && m.kind === 'missing' && m.htx.length === 0 && !m.notes.length}, m);
    const unk = (m.notes || []).map(n => /\[HTX-unknown-call\] (\w+)\(\) with/.exec(n)).filter(Boolean).map(x => x[1]);
    mm.unknown = [...new Set(unk)];
    mm.cat = CATS.find(c => c.match(mm)).id;
    all.push(mm);
  }
}
const byCat = {};
for (const c of CATS) byCat[c.id] = all.filter(m => m.cat === c.id);
const catWeight = c => Math.max(0, ...c.keys.map(cnt));
const ordered = CATS.filter(c => byCat[c.id].length && c.id !== 'epsilon' && c.id !== 'write' && c.id !== 'other')
  .sort((a, b) => catWeight(b) - catWeight(a));
ordered.push(...CATS.filter(c => ['write', 'epsilon', 'other'].includes(c.id) && byCat[c.id].length));

// Missing builtins (unknown-call diagnostics), ordered by corpus usage.
const unknown = {};
for (const m of all) for (const u of m.unknown) (unknown[u] = unknown[u] || []).push(m.file + ':' + m.line);

// ---------------------------------------------------------------- render
const esc = s => String(s).replace(/\|/g, '\\|').replace(/`/g, "'");
const trunc = (s, n) => s.length > n ? s.slice(0, n) + ' ...' : s;
const L = [];
const nVal = all.filter(m => m.kind === 'value' || m.kind === 'missing' || m.kind === 'extra').length;
L.push('# HiTeXeR language/library conformance report', '');
L.push(`Generated ${R.generated} by \`node refactor/conformance/build-report.js\` from the results of`);
L.push('`node refactor/conformance/run.js` (write() output diff against real Asymptote 3.06) and');
L.push('`node refactor/conformance/colors-check.js`.', '');
L.push(`Interpreter under test: \`${snap}\` (git HEAD at the time of the run; the working-tree asy-interp.js was`);
L.push('being edited concurrently and at one point failed to load; a later `--working` run against it gave identical totals).', 'Line numbers below (Lnnnn) refer to the HEAD snapshot.', '');
L.push(`**${R.results.length} test files, ${R.totChecks} write() checks: ${nVal} real mismatches ` +
  `(${all.filter(m => m.kind === 'missing').length} of them "HiTeXeR printed nothing"), ` +
  `${R.totEps} numerical-noise mismatches (agree to 1e-9), ${R.totFormat} format-only.**`, '');
L.push('Corpus counts are the number of diagrams in comparison/asy_src (13,002 files) that call the construct',
  '(`corpus-counts.json`). Categories are ordered by the most-used construct in each.', '');
L.push('## Summary by root cause', '');
L.push('| # | Root cause | real mismatches (+noise/format) | most-used constructs (corpus files) |', '|---|---|---|---|');
ordered.forEach((c, i) => {
  const ks = c.keys.map(k => `${k} ${cnt(k)}`).join(', ');
  L.push(`| ${i + 1} | [${c.title}](#${c.id}) | ${byCat[c.id].filter(m => m.kind !== 'epsilon' && m.kind !== 'format').length} (+${byCat[c.id].filter(m => m.kind === 'epsilon' || m.kind === 'format').length}) | ${ks} |`);
});
L.push('');
L.push('## Constructs where HiTeXeR throws or returns nothing but asy works', '');
L.push('### Whole-program parse/runtime errors', '');
L.push('| test file | HiTeXeR error | construct |', '|---|---|---|');
for (const f of R.results.filter(f => f.htxThrown)) {
  const first = f.mismatches.find(m => m.kind === 'missing');
  L.push(`| ${f.file} | ${esc(f.htxThrown.split('\n')[0])} | \`${esc(trunc(first ? first.src : '', 70))}\` |`);
}
L.push('', '### Unimplemented builtins (HiTeXeR logs `[HTX-unknown-call]` and returns null)', '');
L.push('| function | corpus files | where tested |', '|---|---|---|');
for (const [u, locs] of Object.entries(unknown).sort((a, b) => cnt(b[0]) - cnt(a[0]) || a[0].localeCompare(b[0]))) {
  L.push(`| \`${u}\` | ${cnt(u)} | ${locs.slice(0, 4).join(', ')}${locs.length > 4 ? ` (+${locs.length - 4})` : ''} |`);
}
const silent = all.filter(m => m.kind === 'missing' && !m.unknown.length && !m.fileThrew);
if (silent.length) {
  L.push('', '### Returns nothing without a diagnostic', '',
    'Many of these are repeat calls of a builtin listed above (HiTeXeR warns once per name). The rest ' +
    '(size(path), struct methods and field initializers, transform fields, geometry-module fields, ' +
    'arrowlength/labelmargin) fail silently.', '');
  L.push('| file:line | source | asy |', '|---|---|---|');
  for (const m of silent) L.push(`| ${m.file}:${m.line} | \`${esc(trunc(m.src, 70))}\` | \`${esc(trunc(m.asy.join(' / '), 60))}\` |`);
}
L.push('');
L.push('## Mismatches by root cause', '');
ordered.forEach((c, i) => {
  L.push(`<a id="${c.id}"></a>`, `### ${i + 1}. ${c.title}`, '');
  if (c.keys.length) L.push('Corpus usage: ' + c.keys.map(k => `\`${k}\` ${cnt(k)}`).join(', ') + '.', '');
  if (c.cause) L.push('**Likely cause.** ' + c.cause.replace(/\n/g, ' '), '');
  L.push('| file:line | source | asy (expected) | HiTeXeR (got) | kind |', '|---|---|---|---|---|');
  for (const m of byCat[c.id]) {
    L.push(`| ${m.file}:${m.line} | \`${esc(trunc(m.src, 60))}\` | \`${esc(trunc(m.asy.join(' / '), 110))}\` | \`${esc(trunc(m.htx.join(' / '), 110))}\` | ${m.kind} |`);
  }
  L.push('');
});
const badColors = colors.filter(c => !c.ok);
L.push('## Named pen colors (colors-check.js)', '');
L.push(`${colors.length} pen expressions compared as RGB; HiTeXeR stores 8-bit channels so differences up to 0.5/255 are ignored. ${badColors.length} mismatch:`, '');
L.push('| pen | asy (rgb) | HiTeXeR (rgb) |', '|---|---|---|');
for (const c of badColors) L.push(`| \`${esc(c.name)}\` | ${c.asy ? c.asy.map(x => +x.toFixed(4)).join(', ') : 'n/a'} | ${c.htx ? c.htx.map(x => +x.toFixed(4)).join(', ') : 'n/a (' + esc(c.htxRaw || '') + ')'} |`);
L.push('');
L.push('## Per-file totals', '');
L.push('| file | checks | value/missing | epsilon | format | HiTeXeR threw |', '|---|---|---|---|---|---|');
for (const f of R.results) {
  const k = kk => f.mismatches.filter(m => kk.includes(m.kind)).length;
  L.push(`| ${f.file} | ${f.checks} | ${k(['value', 'missing', 'extra'])} | ${k(['epsilon'])} | ${k(['format'])} | ${f.htxThrown ? 'yes' : ''} |`);
}
L.push('', '## How to run', '',
  '```',
  'node refactor/conformance/run.js                 # all tests vs git HEAD asy-interp.js (real asy output is cached in .cache/)',
  'node refactor/conformance/run.js arrays pairs    # selected tests',
  'node refactor/conformance/run.js --working       # test the working-tree asy-interp.js',
  'node refactor/conformance/colors-check.js        # named pen colors',
  'node refactor/conformance/corpus-counts.js       # refresh corpus-counts.json (about a minute)',
  'node refactor/conformance/build-report.js        # regenerate this file',
  '```', '',
  'Tests live in `tests/*.asy`; every one runs cleanly under asy 3.06 (lines asy rejects were removed).',
  'Output is attributed to source lines by a `write("@@L<n>")` marker the runner splices onto each line',
  'that starts with `write(` or one of the printing helpers (`wi wr wb ws wp wi2 wr2 wpath`), so loop and',
  'if bodies containing writes must be braced. `wpath(g)` prints a path as its nodes plus control points',
  'recovered from point(g, i+1/3) and point(g, i+2/3), so it only depends on point() and length().',
  'Constructs that make HiTeXeR throw at parse time live in their own small files so they only fail themselves.');
fs.writeFileSync(path.join(__dirname, 'REPORT.md'), L.join('\n') + '\n');
console.log('wrote REPORT.md: ' + all.length + ' mismatches in ' + ordered.length + ' categories');
for (const c of ordered) console.log(`  ${String(byCat[c.id].length).padStart(4)}  ${c.id}`);
