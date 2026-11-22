import re, os, json
from collections import defaultdict

ged_path = r'G:\Kinship Atlas - Copy\tree-app\Primary GEDCOM\Ancestry_01112026.ged'
media_root = r'G:\Kinship Atlas - Copy\tree-app\Primary Media Library\Ancestry_01112026_media'
sel_path = r'G:\Kinship Atlas - Copy\tree-app\kinship-selections.json'

text = open(ged_path, encoding='utf-8', errors='replace').read()
lines = text.splitlines()

persons = {}
current = None
for line in lines:
    m = re.match(r'^0 @(\w+)@ (INDI|FAM)', line)
    if m:
        rid, rtype = m.group(1), m.group(2)
        if rtype == 'INDI':
            current = {'id': rid, 'name': None, 'files': []}
            persons[rid] = current
        else:
            current = None
        continue
    if current is None:
        continue
    nm = re.match(r'^1 NAME\s+(.*)', line)
    if nm and current['name'] is None:
        current['name'] = nm.group(1).strip()
    fm = re.match(r'^\s*\d+ FILE\s+(.*)', line)
    if fm:
        current['files'].append(fm.group(1).strip())

def folder_of(path):
    parts = path.replace('/', '\\').split('\\')
    for i, seg in enumerate(parts):
        if seg == 'Ancestry_01112026_media' and i + 1 < len(parts):
            return parts[i + 1]
    return None

person_folders = defaultdict(set)
for pid, p in persons.items():
    for f in p['files']:
        fo = folder_of(f)
        if fo:
            person_folders[pid].add(fo)

gedcom_folders = set()
for folders in person_folders.values():
    gedcom_folders.update(folders)

existing_dirs = set(d for d in os.listdir(media_root) if os.path.isdir(os.path.join(media_root, d)))
true_orphans = sorted(existing_dirs - gedcom_folders)

# Load kinship-selections to check if orphan persons are present
sel = json.load(open(sel_path, encoding='utf-8'))
sel_person_ids = set()
def collect_ids(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ('id', 'personId') and isinstance(v, str) and re.match(r'^I\d+$', v):
                sel_person_ids.add(v)
            collect_ids(v)
    elif isinstance(obj, list):
        for it in obj:
            collect_ids(it)
collect_ids(sel)

print('=== INVESTIGATING 9 TRUE ORPHANS ===\n')
for fo in true_orphans:
    full = os.path.join(media_root, fo)
    files = sorted(os.listdir(full))
    # Extract ID from folder name
    idm = re.search(r'\[(I\d+)\]', fo)
    folder_id = idm.group(1) if idm else None
    print(f'FOLDER: {fo}')
    print(f'  Files in folder: {files}')
    if folder_id:
        if folder_id in persons:
            p = persons[folder_id]
            print(f'  ID {folder_id} EXISTS in GEDCOM as: {p["name"]}')
            print(f'    Person\'s own GEDCOM files: {p["files"]}')
            print(f'    Person\'s linked folders: {sorted(person_folders.get(folder_id, set()))}')
            name_match = folder_id in persons and (p['name'] or '').split('/')[0].strip().split()[0].lower() in fo.lower()
            print(f'    Name roughly matches folder: {name_match}')
        else:
            print(f'  ID {folder_id} NOT FOUND in GEDCOM (stale/invalid ID)')
        print(f'  ID {folder_id} in kinship-selections.json: {folder_id in sel_person_ids}')
    print()