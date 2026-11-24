'use strict';
// Rewrites every FILE line in the primary GEDCOM to point at the file's actual
// place in the media folder, using the same rules as the app's post-organise
// repoint pass. A file name shared by several files is only rewritten when the
// line spells that exact file's folder.
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const backupPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.pre-media-repoint.backup.ged';

if (fs.existsSync(backupPath)) {
  console.log('Backup already exists, refusing to overwrite a previous repoint.');
  process.exit(1);
}
fs.copyFileSync(gedcomPath, backupPath);
console.log('Backup written:', backupPath);

const gedcomText = fs.readFileSync(gedcomPath, 'utf8');
const files = fsHelper.listMediaFiles(mediaDir);
const repointed = core.repointGedcomFiles(gedcomText, files, {
  mediaFolderName: path.basename(mediaDir),
  archiveFolder: 'Archive'
});
if (repointed === gedcomText) {
  console.log('No FILE lines needed repointing; the GEDCOM was left unchanged.');
  process.exit(0);
}
fs.writeFileSync(gedcomPath, repointed, 'utf8');
const before = (gedcomText.match(/^2\s+FILE\s/gm) || []).length;
const after = (repointed.match(/^2\s+FILE\s/gm) || []).length;
const changed = [...gedcomText.split('\n')].filter((l, i) => l !== repointed.split('\n')[i]).length;
console.log(`FILE lines: ${before} -> ${after}; repoint wrote the file.`);
