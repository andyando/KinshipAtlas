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
const ged = fs.readFileSync('G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged', 'utf8');
const stale = ged.split('\n').filter((l) => /^\d+\s+FILE\s/.test(l.trim()) && /tree-app|unknown-unknown/.test(l) && /\.jpg/i.test(l));
let withId = 0, noId = 0, resolved = 0;
const examples = [];
for (const l of stale) {
  const value = l.replace(/^\d+\s+FILE\s+/, '').replace(/\r$/, '').trim();
  const name = core.mediaFileName(value).toLowerCase();
  const id = /\[([^\]]+)\]/.exec(value)?.[1]?.toLowerCase();
  const cands = byName.get(name) || [];
  if (!cands.length) { if (examples.length < 8) examples.push(['ABSENT', value.slice(0, 90)]); continue; }
  if (id) {
    withId++;
    const hit = cands.find((c) => core.mediaFolderOf(c).toLowerCase().endsWith(`[${id}]`));
    if (hit) resolved++;
    else if (examples.length < 8) examples.push([`NOFOLDER ${id}`, value.slice(0, 90)]);
  } else noId++;
}
console.log('stale jpg lines:', stale.length, '| with id:', withId, '| resolved by id:', resolved, '| no id:', noId);
for (const e of examples) console.log(' ', e[0], '|', e[1]);
