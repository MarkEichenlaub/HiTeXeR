import os, re

def in_string_tab(s):
    for ln in s.split('\n'):
        instr = False; j = 0
        while j < len(ln):
            c = ln[j]
            if not instr and c == '/' and j+1 < len(ln) and ln[j+1] == '/':
                break
            if c == '"' and (j == 0 or ln[j-1] != '\\'):
                instr = not instr
            elif c == '\t' and instr:
                return True
            j += 1
    return False

for fid in ['04388', '07734']:
    s = open(f'comparison/asy_src/{fid}.asy', encoding='utf-8', errors='replace').read()
    print(fid, 'has in-string tab:', in_string_tab(s))

def odd_quote_lines(s):
    n = 0
    for ln in s.split('\n'):
        q = len(re.findall(r'(?<!\\)"', ln))
        if q % 2 == 1:
            n += 1
    return n

affected = 0; examples = []
for f in os.listdir('comparison/asy_src'):
    if not f.endswith('.asy'):
        continue
    s = open(f'comparison/asy_src/{f}', encoding='utf-8', errors='replace').read()
    if odd_quote_lines(s) >= 2:
        affected += 1
        if len(examples) < 12:
            examples.append(f)
print('files with strings spanning newlines (possible \\n corruption or multiline):', affected)
print('examples:', examples)
