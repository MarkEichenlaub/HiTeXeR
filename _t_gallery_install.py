import os, shutil
ids = ['12811','12876','12929','12854','12912','12862','12857','12917','12910','12866','12869','12722','12760','12769','12739','12766','12830']
def dims(f):
    b = open(f, 'rb').read(24)
    return int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')
changed = []
for i in ids:
    new = f'_t_ref_{i}.png'
    cur = f'comparison/texer_pngs/{i}.png'
    if not os.path.exists(new):
        print(i, 'no fetched file'); continue
    nw, nh = dims(new)
    cw, ch = dims(cur) if os.path.exists(cur) else (0, 0)
    same = abs(nw-cw) <= 2 and abs(nh-ch) <= 2
    print(i, f'stored {cw}x{ch}  live {nw}x{nh}', 'SAME' if same else 'DIFFERS')
    if not same:
        bak = f'comparison/texer_pngs_backup_pre_refetch/{i}_pre_jul10.png'
        if os.path.exists(cur) and not os.path.exists(bak):
            shutil.copy(cur, bak)
        shutil.copy(new, cur)
        changed.append(i)
print('replaced:', ','.join(changed) if changed else 'none')
