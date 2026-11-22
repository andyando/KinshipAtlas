import re, os
from collections import defaultdict

ged_path = r'G:\Kinship Atlas - Copy\tree-app\Primary GEDCOM\Ancestry_01112026.ged'
media_root = r'G:\Kinship Atlas - Copy\tree-app\Primary Media Library\Ancestry_01112026_media'

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

# person -> set of folders (from GEDCOM FILE paths)
person_folders = defaultdict(set)
for pid, p in persons.items():
    for f in p['files']:
        fo = folder_of(f)
        if fo:
            person_folders[pid].add(fo)

# All folders that appear in ANY GEDCOM FILE path
gedcom_folders = set()
for folders in person_folders.values():
    gedcom_folders.update(folders)

existing_dirs = set(d for d in os.listdir(media_root) if os.path.isdir(os.path.join(media_root, d)))

# True orphans: folders on disk NOT referenced by any GEDCOM FILE path
true_orphans = sorted(existing_dirs - gedcom_folders)
# Folders referenced in GEDCOM but NOT on disk (broken links)
missing_on_disk = sorted(gedcom_folders - existing_dirs)

print(f'Total persons in GEDCOM: {len(persons)}')
print(f'Total folders on disk: {len(existing_dirs)}')
print(f'Total folders referenced in GEDCOM FILE paths: {len(gedcom_folders)}')
print(f'\n=== TRUE ORPHANS (on disk, not in any GEDCOM FILE path): {len(true_orphans)} ===')
for fo in true_orphans:
    full = os.path.join(media_root, fo)
    files = sorted(os.listdir(full))
    print(f'  {fo}  ({len(files)} files)')

print(f'\n=== REFERENCED IN GEDCOM BUT MISSING ON DISK (broken links): {len(missing_on_disk)} ===')
for fo in missing_on_disk:
    print(f'  {fo}')

# People with NO folder (loose files or no files)
no_folder = []
for pid, p in persons.items():
    if pid not in person_folders:
        no_folder.append((pid, p['name'], len(p['files'])))
print(f'\n=== PERSONS WITH NO MEDIA FOLDER: {len(no_folder)} ===')
for pid, name, nfiles in sorted(no_folder):
    print(f'  {pid}: {name}  ({nfiles} loose file refs)')