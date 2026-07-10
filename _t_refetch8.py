import shutil, subprocess, sys, os
ids = ['13618','13619','13647','13648','14060','14061','14062','14063']
os.makedirs('comparison/texer_pngs_backup_pre_refetch', exist_ok=True)
for i in ids:
    src = f'comparison/texer_pngs/{i}.png'
    bak = f'comparison/texer_pngs_backup_pre_refetch/{i}_150dpi.png'
    if os.path.exists(src) and not os.path.exists(bak):
        shutil.copy(src, bak)
    r = subprocess.run([sys.executable, '_texer_http_probe.py', f'comparison/asy_src/{i}.asy', f'_t_ref_{i}.png'],
                       capture_output=True, text=True, timeout=300)
    out = (r.stdout or '') + (r.stderr or '')
    if os.path.exists(f'_t_ref_{i}.png') and os.path.getsize(f'_t_ref_{i}.png') > 500:
        shutil.copy(f'_t_ref_{i}.png', src)
        line = [l for l in out.splitlines() if 'saved' in l]
        print(i, 'REFETCHED', line[0].strip() if line else '')
    else:
        print(i, 'FAILED', out.strip()[:150].replace(chr(10), ' '))
