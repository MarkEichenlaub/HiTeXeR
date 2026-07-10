import io
BS = chr(92)
c = io.open('comparison/asy_src/13525.asy', encoding='utf-8').read()
g = io.open('comparison/asy_src/04296.asy', encoding='utf-8').read()
u = c
rounds = 0
for i in range(6):
    prev = u
    u = u.replace(BS+BS, chr(0)).replace(BS+'n', chr(10)).replace(BS+'"', '"').replace(chr(0), BS)
    rounds = i+1
    if u == prev:
        break
print('rounds:', rounds)
print('decoded == 04296:', u.strip() == g.strip())
if u.strip() != g.strip():
    ua, ga = u.strip().splitlines(), g.strip().splitlines()
    for j in range(max(len(ua), len(ga))):
        x = ua[j] if j < len(ua) else '<missing>'
        y = ga[j] if j < len(ga) else '<missing>'
        if x != y:
            print('DIFF line', j)
            print(' dec:', repr(x))
            print(' ref:', repr(y))
            break
    print('lens:', len(ua), len(ga))
