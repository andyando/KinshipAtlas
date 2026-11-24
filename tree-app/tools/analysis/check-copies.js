'use strict';
// For each planned copy, check whether the destination folder already holds the
// file (same name, or "name (n).ext") and whether sizes match the source.
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const records = [];
let active = null;
for (const rawLine of gedcomText.replace(/^\uFEFF/, '').split('\n')) {
  const line = rawLine.replace(/\r$/, '');
  const start = /^0\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)/.exec(line);
  if (start) { if (active) records.push(active); active = { xref: (start[1] || '').replace(/@/g, ''), tag: start[2].toUpperCase(), lines: [line] }; }
  else if (active) active.lines.push(line);
}
if (active) records.push(active);
const people = records.filter((r) => r.tag === 'INDI').map((record) => {
  let name = '', birth = '', death = '', inB = false, inD = false;
  for (const line of record.lines) {
    const m = /^(\d+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const lv = +m[1], tag = m[2].toUpperCase(), v = m[3];
    if (lv === 1) { inB = tag === 'BIRT'; inD = tag === 'DEAT'; if (tag === 'NAME') name = v; }
    if (lv === 2 && tag === 'DATE') { const y = /\d{4}/.exec(v)?.[0] || ''; if (y && inB && !birth) birth = y; if (y && inD && !death) death = y; }
  }
  name = (name || '').replace(/\//g, '').replace(/"/g, '').replace(/'/g, '').trim().replace(/\s+/g, ' ');
  return { id: record.xref, name, birthYear: birth, deathYear: death };
});
const files = fsHelper.listMediaFiles(mediaDir);
const state = core.computeMediaOrganiseState(records, people, files, { gedcomText, archiveFolder: 'Archive', mediaFolderName: path.basename(mediaDir) });
const plan = core.planMediaOrganise(state);
const copies = plan.actions.filter((a) => a.kind === 'copy');

// Disk lookup: folder (lower) -> name (lower) -> size
const disk = new Map();
for (const f of files) {
  const folder = core.mediaFolderOf(f.relativePath).toLocaleLowerCase();
  const name = core.mediaFileName(f.relativePath).toLocaleLowerCase();
  if (!disk.has(folder)) disk.set(folder, new Map());
  disk.get(folder).set(name, f.size);
}

for (const a of copies) {
  const srcFolder = core.mediaFolderOf(a.fromPath).toLocaleLowerCase();
  const srcName = core.mediaFileName(a.fromPath).toLocaleLowerCase();
  const dstFolder = core.mediaFolderOf(a.toPath).toLocaleLowerCase();
  const dstName = core.mediaFileName(a.toPath).toLocaleLowerCase();
  const srcSize = disk.get(srcFolder)?.get(srcName);
  const dst = disk.get(dstFolder);
  const dstSizes = [];
  if (dst) {
    const base = dstName.replace(/\.(jpg|jpeg|png|pdf)$/i, '');
    for (const [name, size] of dst) {
      if (name === dstName || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+\\)\\.(jpg|jpeg|png|pdf)$`).test(name)) dstSizes.push(`${name}=${size}`);
    }
  }
  console.log(`${a.fromPath.split('/')[0].slice(0, 30)} -> ${dstFolder.slice(0, 30)}`);
  console.log(`  src size: ${srcSize} | dest has: ${dstSizes.join(', ') || 'NOTHING'}`);
}
