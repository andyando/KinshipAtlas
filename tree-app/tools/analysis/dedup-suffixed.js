'use strict';
// Removes exact duplicate copies ("file.jpg", "file (2).jpg", "file (4).jpg"…)
// left inside the same folder by earlier organise runs. The unsuffixed copy is
// kept; the suffixed ones are deleted only when byte-identical (same size, and
// same SHA-256 when sizes match).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const logPath = 'G:/Git/Kinship_Experimental/tree-app/tools/analysis/dedup-log.txt';
const dryRun = !process.argv.includes('--apply');

const groups = new Map(); // folder -> base name -> [{file, size}]
for (const entry of fs.readdirSync(mediaDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = path.join(mediaDir, entry.name);
  for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
    if (file.isDirectory()) continue;
    const name = file.name;
    const match = /^(.*) \((\d+)\)(\.[^.]+)$/.exec(name);
    if (!match) continue;
    const base = `${match[1]}${match[3]}`.toLowerCase();
    if (!groups.has(entry.name)) groups.set(entry.name, new Map());
    const byBase = groups.get(entry.name);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({
      name,
      full: path.join(folder, name),
      size: fs.statSync(path.join(folder, name)).size
    });
  }
}

const log = [];
let removed = 0, kept = 0, mismatched = 0;
for (const [folder, byBase] of groups) {
  for (const [base, copies] of byBase) {
    const keeper = path.join(mediaDir, folder, base);
    if (!fs.existsSync(keeper)) continue;   // the unsuffixed copy was renamed; leave them alone
    const keeperSize = fs.statSync(keeper).size;
    for (const copy of copies) {
      if (copy.size !== keeperSize) { mismatched++; log.push(`SIZE MISMATCH kept: ${folder}\\${copy.name}`); continue; }
      const a = fs.readFileSync(keeper);
      const b = fs.readFileSync(copy.full);
      if (!a.equals(b)) { mismatched++; log.push(`CONTENT MISMATCH kept: ${folder}\\${copy.name}`); continue; }
      if (dryRun) { log.push(`WOULD DELETE: ${folder}\\${copy.name}`); removed++; }
      else { fs.unlinkSync(copy.full); log.push(`DELETED: ${folder}\\${copy.name}`); removed++; }
    }
    kept++;
  }
}
log.push(`dryRun=${dryRun} groups=${kept} removed=${removed} mismatched=${mismatched}`);
fs.writeFileSync(logPath, log.join('\n'), 'utf8');
console.log(`dryRun=${dryRun} duplicate groups=${kept} to remove=${removed} mismatched=${mismatched}`);
if (dryRun) console.log('Re-run with --apply to delete.');
