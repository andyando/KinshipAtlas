'use strict';
// Rewrites the remaining stale FILE lines (old "G:\tree-app\..." or
// "(unknown-unknown)" paths) at their exact on-disk place. Rules:
//   * only image/PDF lines (non-media documents like .html stay as recorded)
//   * a file name unique in the library is repointed directly
//   * an ambiguous name is repointed only when the line's [Ixxxx] matches the
//     disk folder's [Ixxxx]
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-stale-repoint.backup.ged';
if (fs.existsSync(backupPath)) { console.log('Backup exists; not overwriting.'); process.exit(1); }

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir);
const byName = new Map();
for (const file of files) {
  const name = core.mediaFileName(file.relativePath).toLowerCase();
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(file.relativePath);
}

let changed = 0, ambiguous = 0, absent = 0, keptDocs = 0;
const lines = gedcomText.split('\n');
for (let i = 0; i < lines.length; i++) {
  const carriage = lines[i].endsWith('\r') ? '\r' : '';
  const match = /^(\d+\s+FILE\s+)(.+?)\s*\r?$/.exec(lines[i]);
  if (!match) continue;
  const value = match[2].trim();
  const name = core.mediaFileName(value);
  if (!core.isMediaFile(name)) { keptDocs++; continue; }          // .html/.txt/.doc stay
  const lower = name.toLowerCase();
  const candidates = byName.get(lower) || [];
  if (!candidates.length) { absent++; continue; }                 // genuinely not here
  let target = '';
  if (candidates.length === 1) target = candidates[0];
  else {
    const idInLine = /\[([^\]]+)\]/.exec(value)?.[1]?.replace(/^@+|@+$/g, '').toLowerCase();
    if (idInLine) {
      const matches = candidates.filter((c) => core.mediaFolderOf(c).toLowerCase().endsWith(`[${idInLine}]`));
      if (matches.length === 1) target = matches[0];
    }
    if (!target) { ambiguous++; continue; }
  }
  const linePath = core.normalizeMediaPath(value);
  const targetPath = core.normalizeMediaPath(target);
  if (linePath === targetPath) continue;
  lines[i] = `${match[1]}${target}${carriage}`;
  changed++;
}
fs.copyFileSync(gedcomPath, backupPath);
fs.writeFileSync(gedcomPath, lines.join('\n'), 'utf8');
console.log(`repointed: ${changed}, ambiguous skipped: ${ambiguous}, absent: ${absent}, non-media kept: ${keptDocs}`);
const stale = lines.filter((l) => /^\d+ FILE /.test(l.trim()) && /tree-app|unknown-unknown/.test(l));
console.log('stale FILE lines remaining:', stale.length);
