'use strict';
const fs = require('fs');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');
const files = fsHelper.listMediaFiles('G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media').filter((f) => !/^archive\//i.test(f.relativePath));
const byName = new Map();
for (const f of files) {
  const n = core.mediaFileName(f.relativePath).toLowerCase();
  if (!byName.has(n)) byName.set(n, []);
  byName.get(n).push(f.relativePath);
}
// Do folders for I41 / I46 / I47 / I77 exist at all?
for (const probe of ['i41', 'i46', 'i47', 'i77']) {
  const folders = [...new Set(files.filter((f) => core.mediaFolderOf(f).toLowerCase().endsWith(`[${probe}]`)).map((f) => core.mediaFolderOf(f)))];
  console.log(probe, '->', folders.length ? folders : 'NO FOLDER');
}
// And where does WILHO107_1186_1188-0358.jpg actually live?
const cands = byName.get('wilho107_1186_1188-0358.jpg') || [];
for (const c of cands) console.log('file folder:', core.mediaFolderOf(c));
