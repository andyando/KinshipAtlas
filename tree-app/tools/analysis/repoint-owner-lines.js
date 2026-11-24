'use strict';
// Repoints stale FILE lines using the record each line sits in. The record's
// own xref (a person or family id) is the owner: the file belongs in that
// person's folder, whatever the old path spelled. A file name shared by several
// people is resolved by the owner's "[Ixxxx]" folder on disk.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-owner-repoint.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir);
const byName = new Map();
const byOwnerFolder = new Map(); // "[i123]" -> [relativePaths]
for (const file of files) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
  const folder = core.mediaFolderOf(file.relativePath).toLowerCase();
  const id = /\[([^\]]+)\]\s*$/.exec(folder)?.[1]?.toLowerCase();
  if (id) {
    if (!byOwnerFolder.has(id)) byOwnerFolder.set(id, []);
    byOwnerFolder.get(id).push(file.relativePath);
  }
}

// Split into records so each FILE line knows its owning xref.
const lines = gedcomText.split('\n');
const records = [];
let active = null;
for (let i = 0; i < lines.length; i++) {
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(lines[i]);
  if (start) { active = { xref: start[1].replace(/@/g, ''), tag: start[2].toUpperCase(), start: i, end: i }; records.push(active); }
  else if (active) active.end = i;
}

let changed = 0, absent = 0, keptDocs = 0, noOwner = 0, noFolder = 0;
for (const record of records) {
  const isPerson = record.tag === 'INDI' || record.tag === 'FAM';
  const ownerId = isPerson ? record.xref.toLowerCase() : '';
  for (let i = record.start; i <= record.end; i++) {
    const carriage = lines[i].endsWith('\r') ? '\r' : '';
    const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(lines[i]);
    if (!match) continue;
    const value = match[2].trim();
    const name = core.mediaFileName(value);
    if (!core.isMediaFile(name)) { keptDocs++; continue; }   // .html/.txt/.doc stay
    const lower = name.toLowerCase();
    const candidates = byName.get(lower) || [];
    if (!candidates.length) { absent++; continue; }          // genuinely not here
    let target = '';
    if (candidates.length === 1) target = candidates[0];
    else if (ownerId) {
      const owned = candidates.filter((c) => core.mediaFolderOf(c).toLowerCase().endsWith(`[${ownerId}]`));
      if (owned.length === 1) target = owned[0];
    }
    if (!target) {
      // The owner's folder holds no copy. Fall back to the old path's own
      // "[Ixxxx]" folder when the disk holds exactly one file of this name in
      // that person's folder (family members share census images).
      const idInLine = /\[([^\]]+)\]/.exec(value)?.[1]?.toLowerCase();
      if (idInLine) {
        const byId = candidates.filter((c) => core.mediaFolderOf(c).toLowerCase().endsWith(`[${idInLine}]`));
        if (byId.length === 1) target = byId[0];
      }
      if (!target) {
        // Last resort: the old absolute path names a media folder that is a
        // parent of this one ("G:\tree-app\...\<same library name>\..."). When
        // its person folder exists here, read the file from there.
        const oldFolder = core.mediaFolderOf(core.normalizeMediaPath(value));
        const exact = candidates.find((c) => core.mediaFolderOf(c).toLowerCase() === oldFolder);
        if (exact) target = exact;
      }
      if (!target) { noOwner++; continue; }
    }
    if (core.normalizeMediaPath(value) === core.normalizeMediaPath(target)) continue;
    lines[i] = `${match[1]}${target}${carriage}`;
    changed++;
  }
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log(`repointed: ${changed}, unresolvable (shared): ${noOwner}, absent: ${absent}, non-media kept: ${keptDocs}`);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
for (const l of stale.slice(0, 5)) console.log('  ', l.trim().slice(0, 120));
