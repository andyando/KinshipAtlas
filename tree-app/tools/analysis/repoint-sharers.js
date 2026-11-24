'use strict';
// Repoints the remaining stale FILE lines. A census image linked to a family
// (via 2 OBJE @M...@) that no longer sits in the owner's folder: every person
// pointing at that medium is a sharer, and the file lives in one sharer's
// folder. The first sharer (GEDCOM order) whose disk folder holds a copy of the
// file name is where the GEDCOM points — the same person the organiser would
// have kept it for.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-sharer-repoint.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir).filter((f) => !/^archive\//i.test(f.relativePath));
const byName = new Map();
for (const file of files) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
}

// One flat pass: track the owning record xref, the media object a FILE sits in,
// and where each media object is pointed at.
const lines = gedcomText.split('\n');
let currentXref = '', currentTag = '', currentMedium = '';
const mediumHolders = new Map(); // "m123" -> Set of xrefs (filled after first pass)
const mediaOfRecord = new Map(); // xref -> Set of mediums
for (const line of lines) {
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
  if (start) { currentXref = start[1].replace(/@/g, '').toLowerCase(); currentTag = start[2].toUpperCase(); currentMedium = ''; continue; }
  if (currentTag !== 'INDI' && currentTag !== 'FAM') continue;
  const objePointer = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(line.trim());
  if (objePointer) {
    currentMedium = objePointer[1].toLowerCase();
    if (!mediaOfRecord.has(currentXref)) mediaOfRecord.set(currentXref, new Set());
    mediaOfRecord.get(currentXref).add(currentMedium);
  }
  const inlineObje = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(line);
  if (inlineObje) {
    currentMedium = inlineObje[1].toLowerCase();
    if (!mediaOfRecord.has(currentXref)) mediaOfRecord.set(currentXref, new Set());
    mediaOfRecord.get(currentXref).add(currentMedium);
  }
}
for (const [xref, mediums] of mediaOfRecord) for (const m of mediums) {
  if (!mediumHolders.has(m)) mediumHolders.set(m, new Set());
  mediumHolders.get(m).add(xref);
}

// Person order from the GEDCOM.
const personOrder = [];
const famOf = new Map(); // fam xref (lower) -> [husband, wife]
for (const line of lines) {
  const m = /^0\s+@(I[^@]+)@\s+INDI/.exec(line);
  if (m) personOrder.push(m[1].toLowerCase());
  const f = /^0\s+@([^@]+)@\s+FAM/.exec(line);
  if (f) famOf.set(f[1].toLowerCase(), []);
}
// Family members: HUSB and WIFE of each FAM (their folders also hold shared
// census images, and a family record's own files live there).
currentXref = ''; currentTag = '';
let husband = '', wife = '';
for (const line of lines) {
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
  if (start) { currentXref = start[1].replace(/@/g, '').toLowerCase(); currentTag = start[2].toUpperCase(); husband = ''; wife = ''; continue; }
  if (currentTag === 'FAM') {
    const h = /^\d+\s+HUSB\s+@([^@\s]+)@/.exec(line);
    if (h) husband = h[1].replace(/@/g, '').toLowerCase();
    const w = /^\d+\s+WIFE\s+@([^@\s]+)@/.exec(line);
    if (w) wife = w[1].replace(/@/g, '').toLowerCase();
    if (husband || wife) famOf.set(currentXref, [husband, wife]);
  }
}
const folderIdsOf = (relativePath) => {
  const folder = core.mediaFolderOf(relativePath).toLowerCase();
  return [...folder.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].toLowerCase());
};

let changed = 0, absent = 0, keptDocs = 0, unresolved = 0;
currentXref = ''; currentTag = ''; currentMedium = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const start = /^0\s+@([^@]+)@\s+([A-Za-z0-9_]+)/.exec(line);
  if (start) { currentXref = start[1].replace(/@/g, '').toLowerCase(); currentTag = start[2].toUpperCase(); currentMedium = ''; continue; }
  if (currentTag !== 'INDI' && currentTag !== 'FAM') continue;
  const objePointer = /^\d+\s+OBJE\s+@([^@\s]+)@\s*$/.exec(line.trim());
  if (objePointer) { currentMedium = objePointer[1].toLowerCase(); continue; }
  // A bare "3 OBJE" line (Ancestry style) means the FILE lines under it belong
  // to the record itself, not a separate medium.
  if (/^\d+\s+OBJE\s*$/.test(line.trim())) { currentMedium = ''; continue; }
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(line);
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
    const sharers = new Set([currentXref]);
    if (currentMedium) for (const h of mediumHolders.get(currentMedium) || []) sharers.add(h);
    const ordered = [...sharers].sort((a, b) => {
      const ia = personOrder.indexOf(a), ib = personOrder.indexOf(b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
    for (const sharer of ordered) {
      const found = candidates.find((c) => folderIdsOf(c).includes(sharer));
      if (found) { target = found; break; }
    }
    if (!target) {
    if (!target) {
      const idInLine = /\[([^\]]+)\]/.exec(value)?.[1]?.toLowerCase();
      if (idInLine) target = candidates.find((c) => folderIdsOf(c).includes(idInLine)) || '';
      // An FAM record (census of a household): its HUSB/WIFE folders are also
      // correct homes for the image; the earlier of the two in GEDCOM order is
      // the keeper, as the organiser's first-person rule would choose.
      if (!target && currentTag === 'FAM') {
        const [h, w] = famOf.get(currentXref) || [];
        for (const member of [h, w].filter(Boolean)) {
          const found = candidates.find((c) => folderIdsOf(c).includes(member));
          if (found) { target = found; break; }
        }
      }
    }
    }
  }
  if (!target) { unresolved++; continue; }
  if (core.normalizeMediaPath(value) === core.normalizeMediaPath(target)) continue;
  const carriage = line.endsWith('\r') ? '\r' : '';
  lines[i] = `${match[1]}${target}${carriage}`;
  changed++;
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log(`repointed: ${changed}, unresolved: ${unresolved}, absent: ${absent}, non-media kept: ${keptDocs}`);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
