#!/usr/bin/env node
// Organises a media folder from a terminal, using the same rules as the
// "Organise media files" command in the app's Settings menu.
//
//   node helpers/media-organise-cli.mjs "<media folder>" "<gedcom file>" [--apply] [--archive "Archive"]
//
// Without --apply it only prints the plan. With --apply it moves the files and
// writes the GEDCOM back (keeping a timestamped copy beside it) so every FILE
// line points at the file's new place.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('./media-organise.js');
const fsTools = require('./media-organise-fs.js');

const [mediaDir, gedcomFile] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const archiveIndex = process.argv.indexOf('--archive');
const archiveFolder = archiveIndex > 0 ? process.argv[archiveIndex + 1] : core.ARCHIVE_FOLDER;
if (!mediaDir || !gedcomFile) {
  console.error('Usage: node helpers/media-organise-cli.mjs "<media folder>" "<gedcom file>" [--apply] [--archive "Archive"]');
  process.exit(1);
}

// The GEDCOM split into records, the way the app reads it.
function splitRecords(text) {
  const records = [];
  let active = null;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const start = /^0\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/.exec(line);
    if (start) {
      if (active) records.push(active);
      active = { xref: (start[1] || '').replace(/^@|@$/g, ''), tag: start[2].toUpperCase(), lines: [line] };
    } else if (active) active.lines.push(line);
  }
  if (active) records.push(active);
  return records;
}

// Names and years for every person, matching the app's folder names.
function readPeople(records) {
  const people = [];
  for (const record of records) {
    if (record.tag !== 'INDI') continue;
    const value = (tag) => record.lines.map((line) => new RegExp(`^1\\s+${tag}\\s*(.*)$`).exec(line)).find(Boolean)?.[1] || '';
    const given = record.lines.map((line) => /^2\s+GIVN\s+(.*)$/.exec(line)).find(Boolean)?.[1] || '';
    const surname = record.lines.map((line) => /^2\s+SURN\s+(.*)$/.exec(line)).find(Boolean)?.[1] || '';
    const raw = value('NAME');
    let inside = false;
    let year = '';
    const eventYear = (tag) => {
      for (const line of record.lines) {
        if (/^1\s+/.test(line)) inside = new RegExp(`^1\\s+${tag}\\b`).test(line);
        else if (inside) {
          const date = /^2\s+DATE\s+(.*)$/.exec(line);
          if (date) return (date[1].match(/\d{4}/) || [''])[0];
        }
      }
      return '';
    };
    const name = `${given || raw.split('/')[0].trim()} ${surname || (raw.split('/')[1] || '')}`.replace(/\s+/g, ' ').trim();
    people.push({ id: record.xref, name, birthYear: eventYear('BIRT'), deathYear: eventYear('DEAT') });
    void year;
  }
  return people;
}

const text = fs.readFileSync(gedcomFile, 'utf8');
const records = splitRecords(text);
const people = readPeople(records);
const files = fsTools.listMediaFiles(mediaDir);
const state = core.computeMediaOrganiseState(records, people, files, { gedcomText: text, archiveFolder });
const plan = core.planMediaOrganise(state);

console.log(`${people.length} people, ${files.length} media files`);
console.log(`plan: ${plan.placements.length} to move (${plan.counts.replaced} replacing), ${plan.copies.length} to copy, ${plan.archives.length} to archive, ${plan.warnings.length} warning(s)`);
for (const action of plan.actions) console.log(`  ${action.kind.padEnd(8)} ${action.fromPath}  ->  ${action.toPath}`);
for (const warning of plan.warnings) console.log(`  warning: ${warning.message}`);

if (!apply) {
  console.log('Nothing changed. Run again with --apply to carry the plan out.');
  process.exit(0);
}

if (!plan.actions.length) {
  console.log('Nothing to organise.');
  process.exit(0);
}
const result = fsTools.applyPlan(mediaDir, state, plan);
if (result.gedcomText !== text) {
  const backup = path.join(path.dirname(gedcomFile), `${path.basename(gedcomFile, path.extname(gedcomFile))} ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}${path.extname(gedcomFile)}`);
  fs.copyFileSync(gedcomFile, backup);
  fs.writeFileSync(gedcomFile, result.gedcomText, 'utf8');
  console.log(`GEDCOM updated: ${gedcomFile} (previous copy: ${path.basename(backup)})`);
}
console.log(`done: ${result.counts.moved} moved, ${result.counts.copied} copied, ${result.counts.replaced} replaced, ${result.counts.archived} archived, ${result.counts.failed} failed`);
for (const move of result.moves.filter((entry) => !entry.ok)) console.log(`  failed: ${move.fromPath}: ${move.error}`);
