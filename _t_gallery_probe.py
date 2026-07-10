import subprocess, sys, os, shutil, json, time
ids = ['12811','12876','12929','12854','12912','12862','12857','12917','12910','12866','12869','12722','12760','12769','12739','12766','12830']
results = {}
for i in ids:
    out = f'_t_ref_{i}.png'
    if os.path.exists(out):
        os.remove(out)
    try:
        r = subprocess.run([sys.executable, '_texer_http_probe.py', f'comparison/asy_src/{i}.asy', out],
                           capture_output=True, text=True, timeout=300)
        txt = (r.stdout or '') + (r.stderr or '')
    except Exception as e:
        results[i] = 'PROBE-FAIL ' + str(e)[:60]
        print(i, results[i]); continue
    if os.path.exists(out) and os.path.getsize(out) > 500:
        results[i] = 'IMAGE ' + str(os.path.getsize(out))
        # note dims
        import struct
        b = open(out,'rb').read()
        w = int.from_bytes(b[16:20],'big'); h = int.from_bytes(b[20:24],'big')
        print(i, 'IMAGE', f'{w}x{h}')
    elif 'COMPILE ERROR' in txt or 'error' in txt.lower():
        # first meaningful error line
        lines = [l for l in txt.splitlines() if l.strip() and 'COMPILE' not in l]
        key = ''
        for l in lines:
            if 'rror' in l or 'not found' in l or 'No such' in l:
                key = l.strip()[:110]; break
        results[i] = 'ERROR ' + key
        print(i, 'ERROR', key)
    else:
        results[i] = 'UNKNOWN ' + txt.strip()[:100].replace(chr(10),' ')
        print(i, results[i])
    time.sleep(2)
json.dump(results, open('_t_gallery_probe_results.json','w'), indent=1)
