'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const gedcomText = fs.readFileSync(gedcomPath, 'utf8');

function splitRecords(text) {
  const records = [];
  let active = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const start = /^0\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)/.exec(line);
    if (start) {
      if (active) records.push(active);
      active = { xref: (start[1] || '').replace(/@/g, ''), tag: start[2].toUpperCase(), lines: [line] };
    } else if (active) active.lines.push(line);
  }
  if (active) records.push(active);
  return records;
}

const recs = splitRecords(gedcomText);
const read = core.readGedcomMedia(recs);
const files = fsHelper.listMediaFiles(mediaDir);
const entryKeys = new Set(files.map((f) => core.normalizeMediaPath(f.relativePath)));
const entryNames = new Set(files.map((f) => core.normalizeMediaPath(core.mediaFileName(f.relativePath))));

let reported = 0;
const samples = [];
for (const entry of read.files) {
  if (!entry.path) continue;
  const key = core.normalizeMediaPath(entry.path);
  if (entryKeys.has(key)) continue;
  const relative = core.normalizeMediaPath(core.mediaRelativeReference(entry.path, 'Ancestry_01112026_media'));
  if (relative !== key && entryKeys.has(relative)) continue;
  const name = core.mediaFileName(relative);
  if (entryNames.has(core.normalizeMediaPath(name))) continue;
  reported += 1;
  if (samples.length < 15) samples.push(entry.path);
}
console.log(`read files: ${read.files.length}, media files on disk: ${files.length}`);
console.log(`paths that would be reported missing: ${reported}`);
for (const s of samples) console.log(`  ${s}`);
