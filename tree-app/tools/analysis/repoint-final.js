'use strict';
// Repoints stale FILE lines. A shared file (same name in several person
// folders) linked by a record whose own folder has no copy: the record holds
// the medium, and every person pointing at that medium uses the file, so the
// first person (by GEDCOM order) whose folder holds a copy is the keeper.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-final-repoint.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir).filter((f) => !/^archive\//i.test(f.relativePath));
const byName = new Map();
for (const file of files) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
}

// Person order (GEDCOM order) and each person's folder ids on disk.
const personOrder = [];
for (const line of gedcomText.split('\n')) {
  const m = /^0\s+@(I[^@]+)@\s+INDI/.exec(line);
  if (m) personOrder.push(m[1].toLowerCase());
}
const folderIdsOf = (relativePath) => {
  const folder = core.mediaFolderOf(relativePath).toLowerCase();
  return [...folder.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].toLowerCase());
};

const lines = gedcomText.split('\n');
const records = [];
let active = null;
for (let i = 0; i < lines.length; i++) {
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(lines[i]);
  if (start) { active = { xref: start[1].replace(/@/g, '').toLowerCase(), tag: start[2].toUpperCase(), start: i, end: i, media: [] }; records.push(active); }
  else if (active) { active.end = i; const obje = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(lines[i]); if (obje) active.media.push(obje[1].toLowerCase()); }
}
const mediaHolders = new Map();
for (const r of records) for (const m of r.media) { if (!mediaHolders.has(m)) mediaHolders.set(m, []); mediaHolders.get(m).push(r.xref); }
// A record's media set also comes from top-level OBJE records it names; map
// OBJE xref -> file paths declared inside that OBJE record.
const objeFiles = new Map();
let currentObje = null;
for (const line of lines) {
  const start = /^0\s+@([^@]+)@\s+OBJE/.exec(line);
  if (start) { currentObje = start[1].toLowerCase(); objeFiles.set(currentObje, []); continue; }
  const file = /^\d+\s+FILE\s+(.+?)\s*\r?$/.exec(line);
  if (file && currentObje) objeFiles.get(currentObje).push(file[1].trim());
}

let changed = 0, absent = 0, keptDocs = 0, unresolved = 0;
for (const record of records) {
  for (let i = record.start; i <= record.end; i++) {
    const carriage = lines[i].endsWith('\r') ? '\r' : '';
    const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(lines[i]);
    if (!match) continue;
    const value = match[2].trim();
    const name = core.mediaFileName(value);
    if (!core.isMediaFile(name)) { keptDocs++; continue; }
    const lower = name.toLowerCase();
    const candidates = byName.get(lower) || [];
    if (!candidates.length) { absent++; continue; }
    let target = '';
    if (candidates.length === 1) target = candidates[0];
    else {
      // Everyone who shares this file: the record itself plus every holder of
      // the OBJE media it names. The first such person (GEDCOM order) whose
      // disk folder holds a copy is where the GEDCOM points.
      const sharers = new Set([record.xref]);
      for (const m of record.media) for (const h of mediaHolders.get(m) || []) sharers.add(h);
      const ordered = [...sharers].sort((a, b) => {
        const ia = personOrder.indexOf(a), ib = personOrder.indexOf(b);
        return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      });
      for (const sharer of ordered) {
        const match2 = candidates.find((c) => folderIdsOf(c).includes(sharer));
        if (match2) { target = match2; break; }
      }
      if (!target) {
        const idInLine = /\[([^\]]+)\]/.exec(value)?.[1]?.toLowerCase();
        if (idInLine) target = candidates.find((c) => folderIdsOf(c).includes(idInLine)) || '';
      }
    }
    if (!target) { unresolved++; continue; }
    if (core.normalizeMediaPath(value) === core.normalizeMediaPath(target)) continue;
    lines[i] = `${match[1]}${target}${carriage}`;
    changed++;
  }
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log(`repointed: ${changed}, unresolved: ${unresolved}, absent: ${absent}, non-media kept: ${keptDocs}`);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
