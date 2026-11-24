'use strict';
// Final pass: remaining stale lines are shared census/record images whose every
// candidate folder belongs to another family member. The record citing them is
// a person or family in that same family group; the closest folder in GEDCOM
// order (nearest family member before the record) is the keeper.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-nearest-repoint.backup.ged';
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
// Family connections: FAMC/FAMS give the family groups each person belongs to.
const familyOf = new Map(); // xref -> [fam xrefs]
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
// Members of each family (from FAMC/FAMS across all people).
const members = new Map(); // fam xref -> Set of person xrefs
for (const [person, fams] of familyOf) for (const fam of fams) {
  if (!members.has(fam)) members.set(fam, new Set());
  members.get(fam).add(person);
}

const folderIdsOf = (relativePath) => {
  const folder = core.mediaFolderOf(relativePath).toLowerCase();
  return [...folder.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].toLowerCase());
};

let changed = 0, unresolved = 0;
currentXref = ''; currentTag = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
  if (start) { currentXref = start[1].replace(/@/g, '').toLowerCase(); currentTag = start[2].toUpperCase(); continue; }
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(line);
  if (!match) continue;
  if (!/tree-app|unknown-unknown/.test(line)) continue;
  const value = match[2].trim();
  const name = core.mediaFileName(value);
  if (!core.isMediaFile(name)) continue;
  const candidates = byName.get(name.toLowerCase()) || [];
  if (!candidates.length) continue;
  // Family members of the citing record, in GEDCOM order; nearest first.
  const fams = familyOf.get(currentXref) || [];
  const kin = new Set([currentXref]);
  for (const fam of fams) for (const member of members.get(fam) || []) kin.add(member);
  const ordered = [...kin].sort((a, b) => {
    const ia = personOrder.indexOf(a), ib = personOrder.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  let target = '';
  for (const kin of ordered) {
    const found = candidates.find((c) => folderIdsOf(c).includes(kin));
    if (found) { target = found; break; }
  }
  if (!target) { unresolved++; continue; }
  const carriage = line.endsWith('\r') ? '\r' : '';
  lines[i] = `${match[1]}${target}${carriage}`;
  changed++;
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log(`repointed: ${changed}, unresolved: ${unresolved}`);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
