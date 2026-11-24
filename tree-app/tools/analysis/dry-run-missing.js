'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../../helpers/media-organise.js');
const fsHelper = require('../../helpers/media-organise-fs.js');

const mediaDir = 'G:/Kinship Atlas - Copy/tree-app/Primary Media Library/Ancestry_01112026_media';
const gedcomPath = 'G:/Kinship Atlas - Copy/tree-app/Primary GEDCOM/Ancestry_01112026.ged';
const gedcomText = fs.readFileSync(gedcomPath, 'utf8');

function splitRecords(text) {
  const records = [];
  let active = null;
  for (const rawLine of text.replace(/^\uFEFF/, '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const start = /^0\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)/.exec(line);
    if (start) {
      if (active) records.push(active);
      active = { xref: (start[1] || '').replace(/@/g, ''), tag: start[2].toUpperCase(), lines: [line] };
    } else if (active) active.lines.push(line);
  }
  if (active) records.push(active);
  return records;
}

const recs = splitRecords(gedcomText);
const people = recs.filter((r) => r.tag === 'INDI').map((record) => {
  let name = '', birth = '', death = '';
  let inBirth = false, inDeath = false;
  for (const line of record.lines) {
    const m = /^(\d+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    const level = Number(m[1]), tag = m[2].toUpperCase(), value = m[3];
    if (level === 1) { inBirth = tag === 'BIRT'; inDeath = tag === 'DEAT'; if (tag === 'NAME') name = value; }
    if (level === 2 && tag === 'DATE') {
      const year = /\d{4}/.exec(value)?.[0] || '';
      if (year && inBirth && !birth) birth = year;
      if (year && inDeath && !death) death = year;
    }
  }
  name = (name || '').replace(/\//g, '').replace(/"/g, '').replace(/'/g, '').trim().replace(/\s+/g, ' ');
  return { id: record.xref, name, birthYear: birth, deathYear: death };
});

const files = fsHelper.listMediaFiles(mediaDir);
const state = core.computeMediaOrganiseState(recs, people, files, {
  gedcomText,
  archiveFolder: 'Archive',
  mediaFolderName: path.basename(mediaDir)
});
const plan = core.planMediaOrganise(state);
console.log(`actions: ${plan.actions.length}`);
const disk = new Map(fs.readdirSync(mediaDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => [e.name.toLocaleLowerCase(), e.name]));
const tc = (p) => { const s = String(p).split('/'); if (s.length > 1) { const d = disk.get(s[0].toLocaleLowerCase()); if (d) s[0] = d; } return s.join('/'); };
for (const a of plan.actions) console.log(`${a.kind}: ${tc(a.fromPath)} -> ${tc(a.toPath)}`);

const missing = state.warnings.filter((w) => w.kind === 'missing');
console.log(`missing warnings: ${missing.length}`);
for (const w of missing.slice(0, 30)) console.log(`  ${w.path}`);
