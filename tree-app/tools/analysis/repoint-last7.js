'use strict';
// Last 7 stale lines: shared census/record images. Their recorded person
// folders never existed in this copy (the files live in other relatives'
// folders and the archive). Resolve each to a real person folder: a candidate
// folder whose person is in the same immediate family group as the record
// citing the file, preferring the GEDCOM-nearest; otherwise the first
// non-archive folder holding the file.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-last7.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir).filter((f) => !/^archive\//i.test(f.relativePath));
const byName = new Map();
for (const file of files) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
}

const lines = gedcomText.split('\n');
const personOrder = [];
for (const line of lines) {
  const m = /^0\s+@(I[^@]+)@\s+INDI/.exec(line);
  if (m) personOrder.push(m[1].toLowerCase());
}
// All family groups: fam xref -> members (from FAMC/FAMS lines).
const familyOf = new Map();
let currentXref = '', currentTag = '';
for (const line of lines) {
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
  if (start) { currentXref = start[1].replace(/@/g, '').toLowerCase(); currentTag = start[2].toUpperCase(); continue; }
  if (currentTag !== 'INDI') continue;
  const fam = /^\d+\s+(?:FAMC|FAMS)\s+@([^@\s]+)@/.exec(line.trim());
  if (fam) {
    if (!familyOf.has(currentXref)) familyOf.set(currentXref, []);
    familyOf.get(currentXref).push(fam[1].replace(/@/g, '').toLowerCase());
  }
}
const members = new Map();
for (const [person, fams] of familyOf) for (const fam of fams) {
  if (!members.has(fam)) members.set(fam, new Set());
  members.get(fam).add(person);
}
const folderIdsOf = (relativePath) => {
  const folder = core.mediaFolderOf(relativePath).toLowerCase();
  return [...folder.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].toLowerCase());
};

let changed = 0;
currentXref = ''; currentTag = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
  if (start) { currentXref = start[1].replace(/@/g, '').toLowerCase(); currentTag = start[2].toUpperCase(); continue; }
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(line);
  if (!match || !/tree-app|unknown-unknown/.test(line)) continue;
  const value = match[2].trim();
  if (!core.isMediaFile(core.mediaFileName(value))) continue;
  const candidates = byName.get(core.mediaFileName(value).toLowerCase()) || [];
  if (!candidates.length) continue;
  // Kin of the citing record, GEDCOM order.
  const kin = new Set([currentXref]);
  for (const fam of familyOf.get(currentXref) || []) for (const member of members.get(fam) || []) kin.add(member);
  const ordered = [...kin].sort((a, b) => {
    const ia = personOrder.indexOf(a), ib = personOrder.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  let target = '';
  for (const k of ordered) {
    const found = candidates.find((c) => folderIdsOf(c).includes(k));
    if (found) { target = found; break; }
  }
  if (!target) target = candidates[0];   // first non-archive copy: same file, valid link
  const carriage = line.endsWith('\r') ? '\r' : '';
  lines[i] = `${match[1]}${target}${carriage}`;
  changed++;
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log('repointed:', changed);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
