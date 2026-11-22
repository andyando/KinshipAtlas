#!/usr/bin/env python3
"""Analyze Kinship Atlas copy: GEDCOM media links vs media library folders."""
import json, re, os, collections

BASE = r'G:\Kinship Atlas - Copy\tree-app'
GED = os.path.join(BASE, 'Primary GEDCOM', 'Ancestry_01112026.ged')
MEDIA_ROOT = os.path.join(BASE, 'Primary Media Library', 'Ancestry_01112026_media')
SEL = os.path.join(BASE, 'kinship-selections.json')

# ---------- Parse GEDCOM ----------
persons = {}
fams = {}
cur = None
curType = None

def curRec():
    if curType == 'INDI': return persons.get(cur)
    if curType == 'FAM': return fams.get(cur)
    return None

with open(GED, encoding='utf-8', errors='replace') as f:
    for raw in f:
        line = raw.rstrip('\r\n')
        m = re.match(r'^(\d+) (.*)$', line)
        if not m:
            continue
        lev = int(m.group(1))
        rest = m.group(2)
        parts = rest.split(' ', 1)
        tag = parts[0]
        val = parts[1] if len(parts) > 1 else ''
        if lev == 0:
            tokens = rest.split()
            tag = 'INDI' if 'INDI' in tokens else ('FAM' if 'FAM' in tokens else None)
            if tag:
                ident = next((t for t in tokens if t != tag), '')
                curType = tag
                cur = ident.strip('@')
                if tag == 'INDI':
                    persons[cur] = {'gavn': None, 'surn': None, 'birt': None, 'deat': None,
                                    'media': [], 'eventMedia': []}
                else:
                    fams[cur] = {'media': []}
            else:
                cur, curType = None, None
            continue
        rec = curRec()
        if rec is None:
            continue
        if tag == 'GIVN' and lev == 1:
            rec['gavn'] = val
        elif tag == 'SURN' and lev == 1:
            rec['surn'] = val
        elif tag == 'BIRT' and lev == 1:
            rec['curBlock'] = 'BIRT'
        elif tag == 'DEAT' and lev == 1:
            rec['curBlock'] = 'DEAT'
        elif tag in ('EVEN', 'CASTL') and lev == 1:
            rec['curBlock'] = 'EVEN'
        elif lev == 1 and tag not in ('BIRT', 'DEAT', 'EVEN', 'CASTL', 'NAME', 'GIVN', 'SURN', 'DATE', 'FILE', 'NOTE'):
            rec['curBlock'] = None
        elif tag == 'DATE':
            blk = rec.get('curBlock')
            if blk == 'BIRT':
                rec['birt'] = val
            elif blk == 'DEAT':
                rec['deat'] = val
        elif tag == 'FILE':
            key = 'eventMedia' if lev >= 2 and 'eventMedia' in rec else 'media'
            rec[key].append(val)

def yearOf(dateStr):
    if not dateStr:
        return None
    m = re.search(r'(\d{4})', dateStr)
    return m.group(1) if m else None

for p in persons.values():
    p['birthYear'] = yearOf(p['birt'])
    p['deathYear'] = yearOf(p['deat'])

print('=== GEDCOM SUMMARY ===')
print('persons:', len(persons), ' fams:', len(fams))
print('persons with person-level media:', sum(1 for p in persons.values() if p['media']))
print('persons with event media:', sum(1 for p in persons.values() if p['eventMedia']))
print('fams with media:', sum(1 for f in fams.values() if f['media']))


# ---------- Parse selections ----------
with open(SEL, encoding='utf-8') as f:
    sel = json.load(f)
if 'selections' in sel and isinstance(sel['selections'], dict):
    sel = sel['selections']
print('\n=== SELECTIONS KEYS ===')
for k in sel:
    print(' ', k, type(sel[k]).__name__)

def section(name):
    for k, v in sel.items():
        if name in k:
            return v
    return {}

prim = section('primary-media')
addl = section('additional-media')
mtype = section('media-types')
face = section('face-analysis')
hero = section('hero-frame')
print('\nprimary-media entries:', len(prim))
print('additional-media entries:', len(addl))
print('media-types entries:', len(mtype))
print('face-analysis entries:', len(face))
print('hero-frame entries:', len(hero))

print('\n=== SAMPLES ===')
for i, v in list(prim.items())[:2]:
    print('prim', i, '=>', v)
for i, v in list(addl.items())[:2]:
    print('addl', i, '=>', v[:3])
for i, v in list(mtype.items())[:2]:
    print('mtype', i, '=>', v)
for i, v in list(face.items())[:2]:
    print('face', i, '=>', str(v)[:120])
for i, v in list(hero.items())[:2]:
    print('hero', i, '=>', str(v)[:200])

# ---------- List media library ----------
rootFiles = []
folders = {}
for entry in sorted(os.listdir(MEDIA_ROOT)):
    full = os.path.join(MEDIA_ROOT, entry)
    if os.path.isfile(full):
        rootFiles.append(entry)
    elif os.path.isdir(full):
        files = []
        for dirpath, dirnames, filenames in os.walk(full):
            for fn in filenames:
                files.append(os.path.relpath(os.path.join(dirpath, fn), MEDIA_ROOT))
        folders[entry] = files

print('\n=== MEDIA LIBRARY ===')
print('root files:', len(rootFiles))
print('person folders:', len(folders))
for name, files in list(folders.items())[:20]:
    print(f'  {name}: {len(files)} files')
print('files in folders:', sum(len(v) for v in folders.values()))
print('\nROOT FILES (first 40):')
for fn in rootFiles[:40]:
    print('  ', fn)

# ---------- Cross-reference ----------
ged_paths = []
for pid, p in persons.items():
    for mpath in p['media']:
        ged_paths.append((pid, 'person', mpath))
    for mpath in p['eventMedia']:
        ged_paths.append((pid, 'event', mpath))
for fid, fm in fams.items():
    for mpath in fm['media']:
        ged_paths.append((fid, 'fam', mpath))

byName = collections.defaultdict(list)
for fn in rootFiles:
    byName[fn].append(os.path.join(MEDIA_ROOT, fn))
for fname, files in folders.items():
    for rel in files:
        byName[os.path.basename(rel)].append(os.path.join(MEDIA_ROOT, rel))

in_folder = 0
in_root = 0
missing = 0
ged_folder_names = collections.defaultdict(set)
for pid, kind, mpath in ged_paths:
    p = mpath.replace('/', os.sep)
    if os.path.isfile(p):
        target = p
    else:
        base = os.path.basename(p)
        cands = byName.get(base, [])
        if len(cands) != 1:
            missing += 1
            continue
        target = cands[0]
    rel = os.path.relpath(target, MEDIA_ROOT)
    parts = rel.split(os.sep)
    if len(parts) == 1:
        in_root += 1
    else:
        in_folder += 1
        ged_folder_names[pid].add(parts[0])

print('\n=== GEDCOM PATH RESOLUTION ===')
print('total media links:', len(ged_paths))
print('resolving to file in root:', in_root)
print('resolving to file in folder:', in_folder)
print('missing/ambiguous:', missing)

noMedia = [pid for pid in persons if not persons[pid]['media'] and not persons[pid]['eventMedia']]
print('persons with NO linked media:', len(noMedia), 'of', len(persons))

def expectedName(pid, p):
    first = (p['gavn'] or '').strip()
    last = (p['surn'] or '').strip()
    name = (first + ' ' + last).strip() or 'Unknown'
    b = p['birthYear'] or 'unknown'
    d = p['deathYear'] or 'unknown'
    return f'{name} ({b}-{d}) [{pid}]'

print('\n=== PERSONS WITH MEDIA BUT NO FOLDER (first 30) ===')
cnt = 0
for pid in sorted(persons):
    p = persons[pid]
    if (p['media'] or p['eventMedia']) and pid not in ged_folder_names:
        cnt += 1
        if cnt <= 30:
            print(f'  {pid}: {expectedName(pid, p)}  (n={len(p["media"])+len(p["eventMedia"])})')
print('  total:', cnt)

print('\n=== PERSON FOLDER NAME CHECK (first 20 mismatches) ===')
cnt = 0
mism = 0
for pid in sorted(persons):
    if pid in ged_folder_names:
        exp = expectedName(pid, persons[pid])
        for a in sorted(ged_folder_names[pid]):
            if a != exp:
                mism += 1
                if cnt <= 20:
                    cnt += 1
                    print(f'  {pid}: expected={exp!r} actual={a!r}')
                break
print('  total mismatched persons:', mism)

multi = {pid: s for pid, s in ged_folder_names.items() if len(s) > 1}
print('\npersons with media in >1 folder:', len(multi))
for pid, s in list(multi.items())[:10]:
    print('  ', pid, sorted(s))

def resolveCount(paths):
    r = fo = mi = 0
    for p in paths:
        q = p.replace('/', os.sep)
        if os.path.isfile(q):
            rel = os.path.relpath(q, MEDIA_ROOT)
            if len(rel.split(os.sep)) == 1: r += 1
            else: fo += 1
        else:
            if len(byName.get(os.path.basename(p), [])) >= 1: fo += 1
            else: mi += 1
    return (r, fo, mi)

print('\n=== SELECTIONS PATH RESOLUTION ===')
print('primary-media:', resolveCount(list(prim.values())))
print('media-types:', resolveCount(list(mtype.keys())))
print('face-analysis:', resolveCount(list(face.keys())))
a_paths = [p for v in addl.values() for p in v]
print('additional-media (names):', resolveCount(a_paths))

print('\n=== HERO-FRAME SAMPLE (full) ===')
for i, v in list(hero.items())[:3]:
    print(i, json.dumps(v)[:400])

refBases = set()
for pid, kind, mpath in ged_paths:
    refBases.add(os.path.basename(mpath))
refBases.update(mtype.keys())
refBases.update(face.keys())
refBases.update(prim.keys())
for v in addl.values():
    refBases.update(v)
for v in hero.values():
    if isinstance(v, dict):
        for x in v.values():
            if isinstance(x, str):
                refBases.add(os.path.basename(x))

allFiles = rootFiles + [os.path.basename(r) for files in folders.values() for r in files]
orphans = [f for f in allFiles if f not in refBases]
print('\n=== ORPHAN FILES (in library, referenced nowhere) ===')
print('total files:', len(allFiles), ' orphans:', len(orphans))
for o in orphans[:40]:
    print('  ', o)

