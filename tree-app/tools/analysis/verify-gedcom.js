'use strict';
// Final verification of the test copy's GEDCOM:
//   * parses cleanly (records, TRLR, balanced counts)
//   * every media FILE line resolves to a real file in the media folder
//   * no stale paths remain
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const gedcomText = fs.readFileSync(gedcomPath, 'utf8');

const ok = gedcomText.trimEnd().endsWith('0 TRLR');
console.log('ends with 0 TRLR:', ok);

const files = fsHelper.listMediaFiles(mediaDir);
const keys = new Set(files.map((f) => core.normalizeMediaPath(f.relativePath)));
const names = new Set(files.map((f) => core.normalizeMediaPath(core.mediaFileName(f.relativePath))));

const records = [];
let active = null;
for (const raw of gedcomText.replace(/\r$/, '').split('\n')) {
  const line = raw.replace(/\r$/, '');
  const start = /^0\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)/.exec(line);
  if (start) { if (active) records.push(active); active = { xref: start[1] || '', tag: start[2].toUpperCase(), lines: [line] }; }
  else if (active) active.lines.push(line);
}
if (active) records.push(active);
console.log('records:', records.length);

let mediaRefs = 0, missing = 0;
const missingList = [];
for (const record of records) {
  for (const line of record.lines) {
    const m = /^\d+\s+FILE\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const value = m[1].trim();
    if (!core.isMediaFile(core.mediaFileName(value))) continue;
    mediaRefs++;
    const key = core.normalizeMediaPath(value);
    if (keys.has(key)) continue;
    const name = core.normalizeMediaPath(core.mediaFileName(value));
    if (names.has(name)) continue;
    missing++;
    if (missingList.length < 10) missingList.push(value);
  }
}
console.log(`media FILE lines: ${mediaRefs}, unresolved: ${missing}`);
for (const m of missingList) console.log('  MISSING:', m);
const stale = (gedcomText.match(/^\d+\s+FILE\s.*(?:tree-app|unknown-unknown)/gm) || []).length;
console.log('stale path lines:', stale);
