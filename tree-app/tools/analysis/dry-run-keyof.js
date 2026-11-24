'use strict';
// Checks the fixed keyOf logic: every GEDCOM media path must resolve to a file
// on disk (or be an intentional non-media/gedcom reference). Prints any path
// that would still be reported "named in the GEDCOM but is not in the media
// folder", the same set the check dialog would show.
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
  if (start) {
    if (active) records.push(active);
    active = { xref: (start[1] || '').replace(/@/g, ''), tag: start[2].toUpperCase(), lines: [line] };
  } else if (active) active.lines.push(line);
}
if (active) records.push(active);

const files = fsHelper.listMediaFiles(mediaDir);
const entries = new Map();
for (const file of files) {
  const relativePath = core.splitMediaPath(file.relativePath);
  const key = relativePath.toLocaleLowerCase();
  if (!key || entries.has(key)) continue;
  entries.set(key, { relativePath, folder: core.mediaFolderOf(relativePath), name: core.mediaFileName(relativePath) });
}

function keyOf(path) {
  const key = core.normalizeMediaPath(path);
  if (entries.has(key)) return key;
  const relative = core.normalizeMediaPath(core.mediaRelativeReference(path, path.basename ? '' : 'Ancestry_01112026_media'));
  if (relative !== key && entries.has(relative)) return relative;
  const named = core.mediaFileName(relative) || core.mediaFileName(key);
  if (named) {
    for (const candidate of entries.keys()) {
      if (core.sameMediaPath(relative, candidate) || core.mediaFileName(candidate) === named) return candidate;
    }
  }
  return key;
}

const read = core.readGedcomMedia(records);
let missing = 0;
const samples = [];
for (const entry of read.files) {
  if (!entry.path) continue;
  if (core.isGedcomFileReference(entry.path)) continue;
  const key = keyOf(entry.path);
  if (entries.has(key)) continue;
  missing += 1;
  if (samples.length < 15) samples.push(entry.path);
}
console.log(`GEDCOM media references: ${read.files.length}, files on disk: ${files.length}`);
console.log(`would still be reported missing: ${missing}`);
for (const s of samples) console.log(`  ${s}`);
