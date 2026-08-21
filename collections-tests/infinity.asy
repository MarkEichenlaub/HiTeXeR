// inf vs infinity semantics (also passes on asy 3.05)
write(infinity);
write(inf);
write(-inf);
write(1/inf);
write(inf > infinity);
write(finite(inf));
write(finite(infinity));
write(finite(infinity*0.999999));
write(finite(0.0));
write(finite((1,2)));
write(finite((inf,2)));
// (asy 3.11 traps `inf - inf` as an FP-invalid runtime error — exit
// 0xC0000090 — while asy 3.05 yields nan. HiTeXeR follows the permissive
// 3.05 behavior: isnan(inf - inf) == true.)
write(isnan(nan));
write(isnan(0));
write(infinity*2);
write(nan);
