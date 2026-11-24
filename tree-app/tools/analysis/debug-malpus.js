'use strict';
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');
const files = fsHelper.listMediaFiles('G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media');
const ged = fs.readFileSync('G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged', 'utf8');
const lines = ged.split('\n');
const idx = lines.findIndex((l) => l.includes('_Malpus_') && l.includes('FILE'));
const value = lines[idx].replace(/^\d+\s+FILE\s+/, '').replace(/\r$/, '').trim();
const name = core.mediaFileName(value).toLowerCase();
const cands = files.filter((f) => core.mediaFileName(f.relativePath).toLowerCase() === name && !/^archive\//i.test(f.relativePath));
console.log('name:', name, 'candidates:', cands.length);
const idRe = /\[([^\]]+)\]/g;
for (const c of cands) {
  const folder = core.mediaFolderOf(c).toLowerCase();
  const ids = [...folder.matchAll(idRe)].map((m) => m[1]);
  console.log('  ids:', ids.join(','), '|', c.relativePath);
}
