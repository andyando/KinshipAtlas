'use strict';
// Simulate the app's classify-key lookup for Robert's images:
// person-record key  = GEDCOM FILE path as written (possibly old absolute path)
// library key        = normalizeMediaPath(path) — same function, so keys MATCH
// unless the dropdown key differs. Show a few raw keys.
const fs = require('fs');
const base = 'G:/Kinship Atlas - Copy/tree-app';
const text = fs.readFileSync(base + '/Primary GEDCOM/Ancestry_01112026.ged', 'utf8');
const norm = (p) => String(p || '').trim().replace(/^['"]|['"]$/g, '').replaceAll('\\', '/').replace(/\/+/g, '/').toLowerCase();
const paths = [...text.matchAll(/^\s*\d+\s+FILE\s+(.+)$/gm)].map((m) => m[1].trim());
const rob = paths.filter((p) => /robert/i.test(p) && /white/i.test(p));
console.log('Robert FILE paths:', rob.length);
const seen = new Set();
for (const p of rob.slice(0, 400)) {
  const k = norm(p);
  if (seen.has(k)) continue;
  seen.add(k);
  console.log('  key:', k.slice(0, 120));
  if (seen.size > 8) break;
}
