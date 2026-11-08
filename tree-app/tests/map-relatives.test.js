'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function relatives(primary = 'P') {
  const family = (id, husbandId, wifeId, childIds) => ({ id, husbandId, wifeId, childIds });
  const families = [
    family('grand', 'G', '', ['A', 'U']),
    family('parents', 'A', 'B', ['P', 'S']),
    family('cousins', 'U', 'X', ['C']),
    family('children', 'P', 'W', ['D']),
    family('half', 'B', 'Y', ['H']),
    family('adopted', 'A', 'B', ['AD']),
    family('foster', 'A', 'B', ['FO'])
  ];
  const state = {
    primaryPersonId: primary, people: new Map('G A U B P S X C W D Y H AD FO'.split(' ').map((id) => [id, { id }])),
    families: new Map(families.map((entry) => [entry.id, entry]))
  };
  const context = vm.createContext({ state, readPedigree: (child) => child === 'AD' ? 'adopted' : child === 'FO' ? 'foster' : '' });
  const start = source.indexOf('  function primaryBloodlines(');
  const end = source.indexOf('  function getMapInstance(', start);
  vm.runInContext(source.slice(start, end), context);
  return { context, state };
}

test('map blood relatives include ancestors, descendants, siblings, half-siblings and cousins but not spouses', () => {
  const { context } = relatives();
  const result = context.primaryBloodlines().all;
  for (const id of ['P', 'G', 'A', 'B', 'S', 'U', 'C', 'D', 'H']) assert.ok(result.has(id), id);
  for (const id of ['X', 'W', 'Y', 'AD', 'FO']) assert.ok(!result.has(id), id);
});
test('clearing/changing primary recomputes classifications without relying on directory filters', () => {
  const { context, state } = relatives('');
  assert.equal(context.primaryBloodlines().all.size, 0);
  state.primaryPersonId = 'W';
  const result = context.primaryBloodlines().all;
  assert.ok(result.has('W'));
  assert.ok(result.has('D'));
  assert.ok(!result.has('P'));
});

test('father and mother branches include collateral relatives, with descendants separate', () => {
  const { context } = relatives();
  const { paternal, maternal, descendants } = context.primaryBloodlines();
  for (const id of ['A', 'G', 'U', 'C', 'S']) assert.ok(paternal.has(id), id);
  for (const id of ['B', 'H', 'S']) assert.ok(maternal.has(id), id);
  for (const id of ['B', 'H', 'W', 'AD', 'FO']) assert.ok(!paternal.has(id), id);
  for (const id of ['A', 'G', 'C', 'W', 'AD', 'FO']) assert.ok(!maternal.has(id), id);
  assert.deepEqual([...descendants].sort(), ['D', 'P']);
});

test('shared ancestry, cycles, multiple parent families and missing parents are safe', () => {
  const { context, state } = relatives();
  state.families.set('shared', { id: 'shared', husbandId: 'G', wifeId: '', childIds: ['B'] });
  let groups = context.primaryBloodlines();
  assert.ok(groups.paternal.has('G') && groups.maternal.has('G'));
  state.families.set('cycle', { id: 'cycle', husbandId: 'C', wifeId: '', childIds: ['G'] });
  assert.ok(context.primaryBloodlines().all.has('P'));
  state.families.clear();
  state.families.set('unknownFather', { id: 'unknownFather', husbandId: 'MISSING', wifeId: 'B', childIds: ['P'] });
  groups = context.primaryBloodlines();
  assert.equal(groups.paternal.size, 0);
  assert.ok(groups.maternal.has('B'));
  state.families.set('secondMother', { id: 'secondMother', husbandId: '', wifeId: 'A', childIds: ['P'] });
  assert.ok(context.primaryBloodlines().maternal.has('A'));
  state.primaryPersonId = '';
  for (const group of Object.values(context.primaryBloodlines())) assert.equal(group.size, 0);
});

test('bloodline map filter controls pins and unplaced people, and resets without a primary person', () => {
  const mapSource = fs.readFileSync(path.join(__dirname, '..', 'map.js'), 'utf8');
  const start = mapSource.indexOf('    function rebuildPins()');
  const end = mapSource.indexOf('    function drawMarkers()', start);
  const people = ['P', 'C', 'W', 'X'].map((id) => ({ id }));
  let relatives = new Set(['P', 'C']);
  const context = vm.createContext({
    pins: [], unplaced: [], bloodRelativeIds: new Set(), bloodlineOnly: false,
    sideFilters: { maternal: false, paternal: false, descendants: false }, sideFilterToggles: {},
    bloodlineToggle: { parentElement: {} }, relativeLegend: {},
    container: { classList: { toggle() {} } },
    statusChip: { classList: { toggle() {} } },
    options: { getPeople: () => people, getBloodlines: () => ({ all: relatives }) },
    latestPlace: (person) => ['P', 'W'].includes(person.id) ? { lat: 1, lon: 2 } : null,
    projectX: (value) => value, projectY: (value) => value
  });
  vm.runInContext(mapSource.slice(start, end) + '\nrebuildPins();', context);
  assert.equal(context.pins.length, 2);
  assert.equal(context.unplaced.length, 2);
  assert.equal(context.bloodlineToggle.checked, false);
  context.bloodlineOnly = true;
  vm.runInContext('rebuildPins();', context);
  assert.deepEqual(Array.from(context.pins, (pin) => pin.person.id), ['P']);
  assert.deepEqual(Array.from(context.unplaced, (person) => person.id), ['C']);
  relatives = new Set(['W']);
  vm.runInContext('rebuildPins();', context);
  assert.deepEqual(Array.from(context.pins, (pin) => pin.person.id), ['W']);
  assert.equal(context.unplaced.length, 0);
  relatives = new Set();
  vm.runInContext('rebuildPins();', context);
  assert.equal(context.bloodlineToggle.checked, false);
  assert.equal(context.bloodlineToggle.disabled, true);
  assert.equal(context.pins.length, 2);
  assert.equal(context.unplaced.length, 2);
});
