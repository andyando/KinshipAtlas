const fs = require('fs'), path = require('path'), crypto = require('crypto');
function walk(d, skip = new Set(['node_modules', 'vendor', 'Primary Media Library', 'Primary GEDCOM', 'artifacts'])) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p, skip));
    else out.push([p, fs.readFileSync(p)]);
  }
  return out;
}
const A = 'G:/Git/Kinship_Experimental/tree-app', B = 'G:/Kinship Atlas - Copy/tree-app';
const code = (k) => /\.(js|css|html|json|md|svg|ts|cjs|mjs)$/i.test(k);
const a = new Map(walk(A).filter(([p, b]) => code(path.relative(A, p))).map(([p, b]) => [path.relative(A, p), b]));
const b = new Map(walk(B).filter(([p, buf]) => code(path.relative(B, p))).map(([p, buf]) => [path.relative(B, p), buf]));
const hash = (x) => crypto.createHash('md5').update(x).digest('hex');
const all = new Set([...a.keys(), ...b.keys()]);
let d = 0;
for (const k of [...all].sort()) {
  const av = a.get(k), bv = b.get(k);
  if (!bv) { console.log('ONLY-IN-GIT:', k); d++; }
  else if (!av) { console.log('ONLY-IN-COPY:', k); d++; }
  else if (hash(av) !== hash(bv)) { console.log('DIFFERS:', k); d++; }
}
console.log('total code diffs:', d);

