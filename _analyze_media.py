import re, os, json
from collections import defaultdict

ged_path = r'G:\Kinship Atlas - Copy\tree-app\Primary GEDCOM\Ancestry_01112026.ged'
media_root = r'G:\Kinship Atlas - Copy\tree-app\Primary Media Library\Ancestry_01112026_media'

text = open(ged_path, encoding='utf-8', errors='replace').read()
lines = text.splitlines()

persons = {}
fams = {}
current = None
current_event = None

for line in lines:
    m = re.match(r'^0 @(\w+)@ (INDI|FAM)', line)
    if m:
        rid, rtype = m.group(1), m.group(2)
        rec = {'id': rid, 'type': rtype, 'name': None, 'birth': None, 'death': None, 'files': [], 'husb': None, 'wife': None}
        (persons if rtype == 'INDI' else fams)[rid] = rec
        current = rec
        current_event = None
        continue
    if current is None:
        continue
    l1 = re.match(r'^1 (\w+)', line)
    if l1:
        current_event = l1.group(1)
    fm = re.match(r'^\s*(\d+) FILE\s+(.*)', line)
    if fm:
        current['files'].append(fm.group(2).strip())
        continue
    if current['type'] == 'INDI':
        nm = re.match(r'^1 NAME\s+(.*)', line)
        if nm and current['name'] is None:
            current['name'] = nm.group(1).strip()
        dm = re.match(r'^2 DATE\s+(.*)', line)
        if dm and current_event in ('BIRT', 'DEAT'):
            val = dm.group(1).strip()
            ym = re.match(r'(\d{4})', val)
            year = ym.group(1) if ym else 'unknown'
            if current_event == 'BIRT':
                current['birth'] = year
            else:
                current['death'] = year
    if current['type'] == 'FAM':
        hm = re.match(r'^1 HUSB\s+@(\w+)@', line)
        if hm:
            current['husb'] = hm.group(1)
        wm = re.match(r'^1 WIFE\s+@(\w+)@', line)
        if wm:
            current['wife'] = wm.group(1)

def folder_of(path):
    parts = path.replace('/', '\\').split('\\')
    for i, seg in enumerate(parts):
        if seg == 'Ancestry_01112026_media':
            if i + 1 < len(parts) - 1:
                return parts[i + 1]
            return None
    return None

# Loose-file persons: do they ALSO have a folder?
loose_persons = defaultdict(list)
for pid, p in persons.items():
    for f in p['files']:
        if folder_of(f) is None:
            loose_persons[pid].append(f)

print('=== Loose-file persons:', len(loose_persons))
for pid in sorted(loose_persons, key=lambda x: int(re.search(r'\d+', x).group()) if re.search(r'\d+', x) else 0):
    p = persons[pid]
    # does this person have any folder file?
    has_folder = any(folder_of(f) is not None for f in p['files'])
    nloose = len(loose_persons[pid])
    ntotal = len(p['files'])
    print(f'  {pid} {p["name"]} birth={p["birth"]} death={p["death"]} | loose={nloose} total={ntotal} has_folder={has_folder}')
    if has_folder:
        print(f'      folders: {set(folder_of(f) for f in p["files"] if folder_of(f))}')

# I342 and I351 details
print('\n=== I342 and I351 details:')
for pid in ['I342', 'I351']:
    if pid in persons:
        p = persons[pid]
        print(f'  {pid} {p["name"]} birth={p["birth"]} death={p["death"]}')
        for f in p['files']:
            print(f'      {f}')

# Match the 9 orphaned folders to persons by NAME
print('\n=== Matching orphaned folders to persons by name:')
existing_dirs = set(d for d in os.listdir(media_root) if os.path.isdir(os.path.join(media_root, d)))
person_folders = defaultdict(set)
for pid, p in persons.items():
    for f in p['files']:
        fo = folder_of(f)
        if fo:
            person_folders[pid].add(fo)
referenced = set(person_folders.keys())
unref = existing_dirs - referenced

def norm_name(s):
    # extract the name part before (birth-death)
    m = re.match(r'^(.*?)\s*\(\d{4}-', s)
    if m:
        return m.group(1).strip().lower()
    return s.lower()

# build person name index
person_by_name = {}
for pid, p in persons.items():
    if p['name']:
        # normalize: remove /.../ surname markers, lowercase
        nm = p['name'].replace('/', '').strip().lower()
        person_by_name[nm] = (pid, p['name'])

for fo in sorted(unref):
    fname = norm_name(fo)
    # try to find a person whose name matches the folder name (first part)
    match = person_by_name.get(fname)
    print(f'  {fo}')
    print(f'      folder name part: {fname}')
    if match:
        print(f'      MATCH by name: {match[0]} {match[1]}')
    else:
        # try partial match
        cands = [(pid, nm) for nm, (pid, full) in person_by_name.items() if fname in nm or nm in fname]
        print(f'      no exact match; partial candidates: {cands[:5]}')


