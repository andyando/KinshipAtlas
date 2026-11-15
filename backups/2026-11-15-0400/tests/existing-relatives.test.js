'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness() {
  const people = new Map(['A', 'B', 'C'].map((id) => [id, { id, name: `Example ${id}`, sex: '', events: [] }]));
  const state = {
    selectedId: 'A', people, families: new Map(),
    gedcomRecords: [...people.keys()].map((id) => ({ xref: id, tag: 'INDI', lines: [`0 @${id}@ INDI`, `1 NAME Example /${id}/`] }))
  };
  const context = vm.createContext({
    state, normalizeDirectoryName: (text) => text.toLowerCase(),
    nextGedcomXref: () => 'FNEW',
    appendRecordLine: (record, line) => { if (!record.lines.includes(line)) record.lines.push(line); },
    addRecordBeforeTrailer: (record) => state.gedcomRecords.push(record)
  });
  const start = source.indexOf('  function linkExistingRelative(');
  const end = source.indexOf('  function createRelativeRecord(', start);
  vm.runInContext(source.slice(start, end), context);
  const searchStart = source.indexOf('  function existingRelativeCandidates(');
  const searchEnd = source.indexOf('  function syncExistingRelativeChoices(', searchStart);
  vm.runInContext(source.slice(searchStart, searchEnd), context);
  return { state, link: context.linkExistingRelative, search: context.existingRelativeCandidates };
}

test('existing parent links reuse a vacant family and preserve individual facts', () => {
  const h = harness();
  h.state.families.set('F1', { id: 'F1', childIds: ['A'], husbandId: '', wifeId: 'C' });
  h.state.gedcomRecords.push({ xref: 'F1', tag: 'FAM', lines: ['0 @F1@ FAM', '1 WIFE @C@', '1 CHIL @A@'] });
  h.link('B', 'PARENT', 'HUSB', 'F1');
  assert.equal(h.state.gedcomRecords.filter((record) => record.tag === 'INDI').length, 3);
  assert.ok(h.state.gedcomRecords.find((record) => record.xref === 'F1').lines.includes('1 HUSB @B@'));
  assert.equal(h.state.gedcomRecords.find((record) => record.xref === 'F1').lines.filter((line) => line === '1 CHIL @A@').length, 1);
  assert.ok(h.state.gedcomRecords[1].lines.includes('1 FAMS @F1@'));
  assert.ok(h.state.gedcomRecords[0].lines.includes('1 FAMC @F1@'));
});

test('existing spouse creates reciprocal family links without a new person', () => {
  const h = harness();
  h.link('B', 'PARTNER', '', '');
  const family = h.state.gedcomRecords.find((record) => record.tag === 'FAM');
  assert.ok(family.lines.includes('1 HUSB @A@'));
  assert.ok(family.lines.includes('1 WIFE @B@'));
  assert.ok(h.state.gedcomRecords[0].lines.includes('1 FAMS @FNEW@'));
  assert.ok(h.state.gedcomRecords[1].lines.includes('1 FAMS @FNEW@'));
});

test('invalid, duplicate, occupied and cyclic links fail before mutation', () => {
  const h = harness();
  const before = JSON.stringify(h.state.gedcomRecords);
  assert.throws(() => h.link('A', 'PARENT', 'HUSB', ''), /different/);
  h.state.families.set('F1', { id: 'F1', childIds: ['B'], husbandId: 'A' });
  assert.throws(() => h.link('B', 'PARENT', 'HUSB', ''), /cycle/);
  assert.throws(() => h.link('B', 'PARTNER', '', ''), /ancestor/i);
  h.state.families.set('F2', { id: 'F2', childIds: ['A'], husbandId: 'C' });
  assert.throws(() => h.link('C', 'PARENT', 'HUSB', ''), /already/);
  assert.throws(() => h.link('B', 'PARENT', 'HUSB', 'F2'), /cycle|occupied/);
  assert.equal(JSON.stringify(h.state.gedcomRecords), before);
});

test('search excludes self and matches name or ID', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.search('example b'), (person) => person.id), ['B']);
  assert.deepEqual(Array.from(h.search('A'), (person) => person.id), ['B', 'C']);
  assert.equal(h.search('not found').length, 0);
});

test('parent-family selection checks ancestry for every child in the family', () => {
  const h = harness();
  h.state.families.set('F1', { id: 'F1', childIds: ['A', 'B'], husbandId: '', wifeId: 'C' });
  h.state.gedcomRecords.push({ xref: 'F1', tag: 'FAM', lines: ['0 @F1@ FAM', '1 CHIL @A@', '1 CHIL @B@'] });
  assert.throws(() => h.link('B', 'PARENT', 'HUSB', 'F1'), /cycle/);
});
