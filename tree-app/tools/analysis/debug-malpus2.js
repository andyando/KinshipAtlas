'use strict';
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');
const files = fsHelper.listMediaFiles('G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media').filter((f) => !/^archive\//i.test(f.relativePath));
const ged = fs.readFileSync('G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged', 'utf8');
const lines = ged.split('\n');
const idx = lines.findIndex((l) => l.includes('_Malpus_') && l.includes('FILE'));
const value = lines[idx].replace(/^\d+\s+FILE\s+/, '').replace(/\r$/, '').trim();
const name = core.mediaFileName(value).toLowerCase();
const idRe = /\[([^\]]+)\]/g;
for (const f of files) {
  if (core.mediaFileName(f.relativePath).toLowerCase() !== name) continue;
  const folder = core.mediaFolderOf(f.relativePath).toLowerCase();
  const ids = [...folder.matchAll(idRe)].map((m) => m[1]);
  console.log('ids:', ids.join(','), '|', folder.slice(0, 60));
}
// What does the owning record look like?
let xref = '', tag = '', medium = '';
for (let i = 0; i <= idx; i++) {
  const m = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(lines[i]);
  if (m) { xref = m[1]; tag = m[2]; medium = ''; }
  const o = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(lines[i].trim());
  if (o) medium = o[1];
}
console.log('record:', xref, tag, 'medium:', medium);
// Who points at that medium?
if (medium) {
  const holders = [];
  let inRecord = null;
  for (const line of lines) {
    const s = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
    if (s) inRecord = s[1];
    const p = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(line.trim());
    if (p && p[1].toLowerCase() === medium.toLowerCase()) holders.push(inRecord);
  }
  console.log('medium holders:', holders.join(','));
}
