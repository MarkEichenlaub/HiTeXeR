import io, shutil
g = io.open('comparison/asy_src/04296.asy', encoding='utf-8').read()
# in-place repair of the double-escaped rescrape (decodes byte-identical to 04296)
for dst in ['comparison/asy_src/13525.asy',
            'asy_corpus/c289_L2_p38352_problem_text_0__rp4xf8c.asy']:
    io.open(dst, 'w', encoding='utf-8', newline='').write(g)
    print('repaired', dst)
