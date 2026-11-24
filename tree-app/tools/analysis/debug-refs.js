'use strict';
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');
const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const ged = fs.readFileSync('G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged', 'utf8');
const files = fsHelper.listMediaFiles(mediaDir);
const keys = new Set(files.map((f) => core.normalizeMediaPath(f.relativePath)));
const names = new Set(files.map((f) => core.normalizeMediaPath(core.mediaFileName(f.relativePath))));
const records = [];
let active = null;
for (const raw of ged.split('\n')) {
  const line = raw.replace(/\r$/, '');
  const s = /^0\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)/.exec(line);
  if (s) { if (active) records.push(active); active = { xref: s[1] || '', tag: s[2].toUpperCase(), lines: [line] }; }
  else if (active) active.lines.push(line);
}
if (active) records.push(active);
let refs = 0;
const missing = [];
for (const r of records) {
  for (const l of r.lines) {
    const m = /^\d+\s+FILE\s+(.+?)\s*$/.exec(l);
    if (!m) continue;
    const v = m[1].trim();
    if (!core.isMediaFile(core.mediaFileName(v))) continue;
    refs++;
    const k = core.normalizeMediaPath(v);
    if (keys.has(k)) continue;
    const n = core.normalizeMediaPath(core.mediaFileName(v));
    if (names.has(n)) continue;
    missing.push(v);
  }
}
console.log('media refs:', refs, 'unresolved:', missing.length);
for (const m of missing.slice(0, 14)) console.log('  ', m.slice(0, 110));
