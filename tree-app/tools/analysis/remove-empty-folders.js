'use strict';
// Removes empty person folders the bug created, including nested ones inside
// person folders, deepest first. Only folders with no entries at all are
// removed, so no file can be lost. Archive is never touched.
const fs = require('fs');
const path = require('path');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';

let removed = 0;
let pass = 1;
for (; ;) {
  const folders = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      walk(full);
      folders.push(full);
    }
  })(mediaDir);
  // Deepest first: a parent is removed once its emptied children are gone.
  let removedThisPass = 0;
  for (const folder of folders.sort((a, b) => b.length - a.length)) {
    if (path.basename(folder) === 'Archive') continue;
    try {
      if (fs.readdirSync(folder).length === 0) { fs.rmdirSync(folder); removed++; removedThisPass++; }
    } catch { }
  }
  if (!removedThisPass) break;
  pass++;
}
console.log(`removed ${removed} empty folders in ${pass} passes`);
const top = fs.readdirSync(mediaDir, { withFileTypes: true });
console.log(`top-level entries: ${top.length}`);
