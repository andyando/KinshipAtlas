'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  // Merging a matched person');
const end = source.indexOf('  // People only match when');
assert.ok(start > 0 && end > start, 'merge helpers not found in app.js');

const context = vm.createContext({
  eventNames: { BIRT: 'Birth', DEAT: 'Death', RESI: 'Residence', OCCU: 'Occupation' },
  eventTags: new Set(['BIRT', 'DEAT', 'RESI', 'OCCU'])
});
vm.runInContext(`${source.slice(start, end)}\nthis.api = { importMergeAdditions, buildMergedLines };`, context);
const plain = (value) => JSON.parse(JSON.stringify(value));
const importMergeAdditions = (...args) => plain(context.api.importMergeAdditions(...args));
const buildMergedLines = (...args) => plain(context.api.buildMergedLines(...args));

const records = (list) => new Map(list.map((record) => [record.xref, record]));

// Made-up test people only.
const existing = [
  '0 @I1@ INDI',
  '1 NAME Test /Person/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1 JAN 1900',
  '1 DEAT',
  '2 DATE 1950',
  '1 RESI',
  '2 DATE 1920',
  '2 PLAC Sampletown',
  '1 SOUR @S1@',
  '1 FAMS @F1@',
  ''
];
const incoming = [
  '0 @P9@ INDI',
  '1 NAME Test /Person/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 1 JAN 1900',
  '2 PLAC Exampleville',
  '1 DEAT',
  '2 DATE 1951',
  '1 RESI',
  '2 DATE 1920',
  '2 PLAC Sampletown',
  '1 OCCU Baker',
  '2 DATE 1925',
  '1 SOUR @S7@',
  '1 FAMS @F4@',
  '1 CHAN',
  '2 DATE 1 JAN 2020'
];
const existingRecords = records([{ xref: 'I1', tag: 'INDI', lines: existing }, { xref: 'S1', tag: 'SOUR', lines: ['0 @S1@ SOUR', '1 TITL Sample Register'] }]);
const incomingRecords = records([{ xref: 'P9', tag: 'INDI', lines: incoming }, { xref: 'S7', tag: 'SOUR', lines: ['0 @S7@ SOUR', '1 TITL Sample Register'] }]);

test('lists only missing details, skips links and identical facts, and reports differences', () => {
  const additions = importMergeAdditions(incoming, existing, incomingRecords, existingRecords);
  assert.deepEqual(additions.blocks.map((block) => block.label), ['Occupation · Baker · 1925']);
  assert.equal(additions.blocks[0].kind, 'event');
  assert.deepEqual(additions.fills.map((fill) => fill.lines), [['2 PLAC Exampleville']]);
  assert.equal(additions.fills[0].insertAt, 5);
  assert.equal(additions.conflicts.length, 1);
  assert.equal(additions.conflicts[0].existing, '1950');
  assert.equal(additions.conflicts[0].incoming, '1951');
});

test('builds merged lines with fills inside their block and new blocks before trailing blanks', () => {
  const additions = importMergeAdditions(incoming, existing, incomingRecords, existingRecords);
  const merged = buildMergedLines(existing, additions);
  assert.deepEqual(merged.slice(3, 6), ['1 BIRT', '2 DATE 1 JAN 1900', '2 PLAC Exampleville']);
  assert.deepEqual(merged.slice(-4), ['1 FAMS @F1@', '1 OCCU Baker', '2 DATE 1925', '']);
  assert.ok(merged.includes('2 DATE 1950'), 'existing death date is kept');
  assert.ok(!merged.includes('2 DATE 1951'), 'conflicting value is not added');
});

test('a merged record has nothing further to add', () => {
  const first = importMergeAdditions(incoming, existing, incomingRecords, existingRecords);
  const merged = buildMergedLines(existing, first);
  const again = importMergeAdditions(incoming, merged, incomingRecords, records([...existingRecords.values(), { xref: 'I1', tag: 'INDI', lines: merged }]));
  assert.equal(again.blocks.length + again.fills.length, 0);
});

test('a source with a different title is added as a new detail', () => {
  const other = records([{ xref: 'S7', tag: 'SOUR', lines: ['0 @S7@ SOUR', '1 TITL Another Register'] }]);
  const additions = importMergeAdditions(['0 @P9@ INDI', '1 SOUR @S7@'], existing, other, existingRecords);
  assert.deepEqual(additions.blocks.map((block) => [block.label, block.kind]), [['Source: Another Register', 'detail']]);
});
