import json

d = json.load(open(r'G:\Kinship Atlas - Copy\tree-app\kinship-selections.json', encoding='utf-8-sig'))
s = d['selections']

mset = 'kinship-atlas:primary-media:v1:b0b876d2c227aeebb1a2199ca42810c653fc36dcb9071ad4d0209e71d1bbb632'
pm = s[mset]
print('PM size:', len(pm))
print('PM I72:', json.dumps(pm.get('I72')))
print('PM I73:', json.dumps(pm.get('I73')))
print('PM I1:', json.dumps(pm.get('I1')))
# print 10 samples
for i, (k, v) in enumerate(pm.items()):
    if i >= 10:
        break
    print(' PM', k, '=>', json.dumps(v))

am = s[mset + ':additional-media:v1']
print('AM size:', len(am))
for k, v in am.items():
    print(' AM', k, '=>', json.dumps(v))

print('HERO I73:', json.dumps(s['kinship-atlas:hero-frame:I73']))
print('HERO I72:', json.dumps(s['kinship-atlas:hero-frame:I72']))
print('HERO I70:', json.dumps(s['kinship-atlas:hero-frame:I70']))
print('HERO I71:', json.dumps(s['kinship-atlas:hero-frame:I71']))

pp = s['kinship-atlas:primary-person:v1:Ancestry_01112026.ged']
print('PRIMARY-PERSON:', json.dumps(pp))

mt = s['kinship-atlas:media-types:v1:' + mset]
print('MT size:', len(mt))
for i, (k, v) in enumerate(mt.items()):
    if i >= 10:
        break
    print(' MT', k, '=>', json.dumps(v))

fa = s['kinship-atlas:media-face-analysis:v2:' + mset]
print('FA size:', len(fa))
for k, v in fa.items():
    print(' FA', k, '=>', json.dumps(v)[:400])

# c5ce set
cset = 'kinship-atlas:primary-media:v1:c5ce33c6331458e0e41770e563e6a8068ec8d644d9db5c6e0762bb59a8fb06ed'
print('CSET value:', json.dumps(s[cset])[:500])
cam = s[cset + ':additional-media:v1']
print('CAM value:', json.dumps(cam)[:500])


