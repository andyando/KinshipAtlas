import re

ged_path = r'G:\Kinship Atlas - Copy\tree-app\Primary GEDCOM\Ancestry_01112026.ged'
text = open(ged_path, encoding='utf-8', errors='replace').read()
lines = text.splitlines()

targets = ['I1909', 'I1908', 'I482', 'I2162', 'I1857', 'I434', 'I1640']
current = None
for line in lines:
    m = re.match(r'^0 @(\w+)@ (INDI|FAM)', line)
    if m:
        current = m.group(1) if m.group(2) == 'INDI' else None
        if current in targets:
            print(f'\n===== PERSON {current} =====')
        continue
    if current in targets:
        if re.match(r'^1 NAME', line):
            print('  ' + line)
        if re.search(r'\bFILE\b', line):
            print('  ' + line)