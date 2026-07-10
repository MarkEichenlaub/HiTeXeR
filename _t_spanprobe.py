import subprocess, os, re, sys
TMP = r'C:\Users\Public\htx_oracle'
tail = open(os.path.join(TMP, '_probe_tail.asy')).read()
ids = sys.argv[1:] or ['00018', '00130', '07663', '07647', '12275', '00247', '00026']
for i in ids:
    code = open(f'comparison/asy_src/{i}.asy').read()
    m = re.search(r'size\w*\s*[(=]\s*[\d.]', code)
    wrapped = 'import graph;\nsize(400,400);\n' + code + ('' if m else '\nsize(150,150);') + '\n' + tail
    f = os.path.join(TMP, f'p{i}.asy')
    open(f, 'w').write(wrapped)
    try:
        r = subprocess.run([r'C:\Program Files\Asymptote\asy.exe', '-f', 'eps', '-noV', '-o', f'p{i}', f],
                           cwd=TMP, timeout=120, capture_output=True, text=True)
        vals = dict(re.findall(r'HTXDBG (\w+)=\s*([-\d.a-z]+)', r.stdout + r.stderr))
        print(i, 'W1=%s H1=%s sxx=%s exact=%s' % (vals.get('W1', '?')[:7], vals.get('H1', '?')[:7], vals.get('sxx', '?')[:7], vals.get('exact', '?')))
    except Exception as e:
        print(i, 'ERR', str(e)[:80])
