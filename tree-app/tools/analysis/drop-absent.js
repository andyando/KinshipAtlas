'use strict';
// Removes FILE lines (and their OBJE wrapper when it becomes empty) that name
// media files which genuinely are not anywhere in this media library. These
// are pages the original install had that this copy never received.
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-drop-absent.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir);
const byName = new Map();
for (const file of files) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
}

const lines = gedcomText.split('\n');
let dropped = 0;
// Walk backwards so removing lines does not disturb indexes above.
for (let i = lines.length - 1; i >= 0; i--) {
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(lines[i]);
  if (!match) continue;
  if (!/tree-app|unknown-unknown/.test(lines[i])) continue;
  const value = match[2].trim();
  if (!core.isMediaFile(core.mediaFileName(value))) continue;
  const name = core.mediaFileName(value).toLowerCase();
  if ((byName.get(name) || []).length) continue;   // exists somewhere: leave for the organiser
  // Drop this FILE line and, when its OBJE block holds nothing else, the OBJE too.
  lines.splice(i, 1);
  dropped++;
  // Find the enclosing OBJE start above (same or lower level).
  const level = Number(match[1].split(/\s+/)[0]);
  for (let j = i - 1; j >= 0; j--) {
    const objMatch = /^(\d+)\s+OBJE\s*(.*)\r?$/.exec(lines[j]);
    if (objMatch && Number(objMatch[1]) < level) {
      // Check whether any FILE remains between the OBJE and the removed line.
      let hasFile = false;
      for (let k = j + 1; k < i; k++) if (/^\d+\s+FILE\s/.test(lines[k])) hasFile = true;
      if (!hasFile) { lines.splice(j, i - j); dropped += i - j; }
      break;
    }
    if (/^\d+\s+(?:BIRT|DEAT|MARR|RESI|CENS|OCCU|NOTE|SOUR|SEX|NAME|FAMC|FAMS|CHR|BAPM|BURI)\b/.test(lines[j])) break;
  }
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log('lines dropped (FILE + empty OBJE wrappers):', dropped);
const stale = lines.filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
