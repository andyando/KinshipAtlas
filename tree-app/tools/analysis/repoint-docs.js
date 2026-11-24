'use strict';
// Final cleanup of the remaining stale lines:
//   * non-media documents (.html/.txt/.doc…): the recorded absolute path names
//     the same library this tree keeps, so it is rewritten as
//     "Person folder/file.ext" — a plain relative path into the media folder.
//   * media lines whose exact relative path (person folder + name) exists on
//     disk: rewritten to that relative path.
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-doc-repoint.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const onDisk = new Set(fsHelper.listMediaFiles(mediaDir).map((f) => core.normalizeMediaPath(f.relativePath)));

const lines = gedcomText.split('\n');
let docs = 0, media = 0;
for (let i = 0; i < lines.length; i++) {
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(lines[i]);
  if (!match) continue;
  if (!/tree-app|unknown-unknown/.test(lines[i])) continue;
  const value = match[2].trim();
  const relative = core.mediaRelativeReference(value, path.basename(mediaDir)).trim();
  if (!relative) continue;
  // The absolute path ends with "<media library>/<person folder>/<file>", so
  // the part after the library is the file's place in this media folder.
  const parts = core.splitMediaPath(value).split('/');
  const mediaIndex = parts.map((p) => /media$/i.test(p)).lastIndexOf(true);
  if (mediaIndex < 0 || mediaIndex + 1 >= parts.length) continue;
  const rest = parts.slice(mediaIndex + 1).join('/');
  const key = core.normalizeMediaPath(rest);
  const isMedia = core.isMediaFile(core.mediaFileName(rest));
  if (isMedia && !onDisk.has(key)) continue;   // media file really is absent
  const carriage = lines[i].endsWith('\r') ? '\r' : '';
  lines[i] = `${match[1]}${rest}${carriage}`;
  if (isMedia) media++; else docs++;
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log(`rewritten: media ${media}, documents ${docs}`);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
