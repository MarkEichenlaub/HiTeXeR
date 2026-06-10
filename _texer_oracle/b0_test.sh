#!/bin/bash
# B0 sweep: emulate TeXeR wrapper with local asy
ASY="C:\Program Files\Asymptote\asy.exe"
for u in 0.3 0.8 1.5 3 6; do
cat > b0_$u.asy << INNER
size(400,400);
unitsize(${u}cm);
pair bc=(0.433,0);
draw((0,0)--(Cos(30),0)--(0,Sin(30))--cycle);
draw("\$mg\$", shift(bc)*((0,0)--(0,-.5)));
INNER
"$ASY" -f eps -noV b0_$u.asy 2>&1 | head -3
if [ -f b0_$u.eps ]; then
  grep -m1 "%%HiResBoundingBox\|%%BoundingBox" b0_$u.eps
fi
done
