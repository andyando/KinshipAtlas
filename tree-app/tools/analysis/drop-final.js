'use strict';
// The last stale lines: media files this copy never received (they exist only
// in the original install). Remove the FILE line and any empty OBJE wrapper.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-final-drop.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const byName = new Map();
for (const file of fsHelper.listMediaFiles(mediaDir)) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
}

const lines = gedcomText.split('\n');
let dropped = 0;
for (let i = lines.length - 1; i >= 0; i--) {
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(lines[i]);
  if (!match) continue;
  if (!/tree-app|unknown-unknown/.test(lines[i])) continue;
  const value = match[2].trim();
  if (!core.isMediaFile(core.mediaFileName(value))) continue;
  const name = core.mediaFileName(value).toLowerCase();
  if ((byName.get(name) || []).length) continue;
  lines.splice(i, 1);
  dropped++;
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log('FILE lines dropped:', dropped);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
