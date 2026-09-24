// pens: numeric properties
// ---- printing helpers: avoid depending on write(array)/write(path)/string(real) formats
// (those are tested separately in write_format.asy). One value per output line.
void wi(int[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wr(real[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wb(bool[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void ws(string[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wp(pair[] a) { write("n=" + string(a.length)); for (int i = 0; i < a.length; ++i) { write(a[i]); } }
void wi2(int[][] a) { write("rows=" + string(a.length)); for (int i = 0; i < a.length; ++i) { wi(a[i]); } }
void wr2(real[][] a) { write("rows=" + string(a.length)); for (int i = 0; i < a.length; ++i) { wr(a[i]); } }
// path: node count, then per segment: start, control1, control2 (recovered from
// point() at t=1/3, 2/3 so it needs only point()/length()), then the end node.
void wpath(path g) { int n = length(g); write("len=" + string(n)); for (int i = 0; i < n; ++i) { pair P0 = point(g, i), P3 = point(g, i+1); pair U = 27*point(g, i+1/3) - 8*P0 - P3; pair V = 27*point(g, i+2/3) - P0 - 8*P3; write(P0); write((2*U - V)/18); write((2*V - U)/18); } write(point(g, n)); }
// ---- end helpers
write(linewidth(defaultpen));
write(linewidth(linewidth(2)));
write(linewidth(red + 3));
write(linewidth(red + linewidth(0.5)));
write(linewidth(black + 1.5bp));
write(linewidth(currentpen));
write(fontsize(fontsize(12)));
write(fontsize(defaultpen));
write(fontsize(currentpen + fontsize(8)));
wr(colors(red));
wr(colors(green));
wr(colors(blue));
wr(colors(gray(0.5)));
wr(colors(rgb(0.1, 0.2, 0.3)));
wr(colors(0.5*red));
wr(colors(red + blue));
wr(colors(red + green));
wr(colors(0.5*red + 0.5*blue));
wr(colors(white));
wr(colors(black));
wr(colors(lightgray));
wr(colors(darkgreen));
wr(colors(orange));
wr(colors(purple));
wr(colors(cyan));
wr(colors(magenta));
wr(colors(yellow));
wr(colors(brown));
wr(colors(pink));
wr(colors(lightblue));
wr(colors(heavyblue));
wr(colors(mediumgray));
wr(colors(RGB(255, 128, 0)));
wr(colors(rgb("ff8000")));
wr(colors(cmyk(red)));
wr(colors(interp(red, blue, 0.25)));
wr(colors(gray));
write(colors(invisible));
write(colorspace(red));
write(colorspace(gray(0.3)));
write(colorspace(cmyk(red)));
wr(colors(mediumblue));
wr(colors(olive));
wr(colors(royalblue));
wr(colors(deepgreen));
wr(colors(palered));
wr(colors(lightred));
wr(colors(green + red + blue));
wr(colors(red*0.3 + green));
write(opacity(opacity(0.4)));
write(opacity(red));
write(linewidth(1 + red));
write(linewidth(2 + linewidth(3)));
wr(linetype(dashed));
wr(linetype(dotted));
write(linetype(solid));
wr(linetype(dashdotted));
wr(linetype(longdashed));
write(linecap(squarecap));
write(linejoin(roundjoin));
wr(colors(rgb(red)));
wr(colors(gray(red)));
wr(colors(lightgreen));
wr(colors(darkblue));
wr(colors(darkgray));
wr(colors(lightyellow));
wr(colors(red + 0.5*green));
wr(colors(1.5*gray(0.4)));
