'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness() {
  const state = {
    people: new Map(['P', 'Q', 'R', 'A', 'B', 'C', 'H', 'U', 'V', 'W'].map((id) => [id, {
      id, name: `Example ${id}`, parentFamilyIds: [], spouseFamilyIds: []
    }])),
    families: new Map()
  };
  function family(id, husbandId, wifeId, childIds) {
    state.families.set(id, { id, husbandId, wifeId, childIds });
    for (const childId of childIds) {
      const person = state.people.get(childId);
      if (person) person.parentFamilyIds.push(id);
    }
  }
  family('F1', 'P', 'Q', ['A']);
  family('F2', 'P', 'Q', ['B', 'C']);
  family('F3', 'P', 'R', ['H']);
  family('F4', '', '', ['U', 'V']);
  family('F5', '', '', ['W']);
  const context = vm.createContext({
    state, personName: (id) => state.people.get(id)?.name, partnersOf: () => []
  });
  for (const [startMarker, endMarker] of [
    ['  function siblingFamiliesOf(', '\n  function generationLevels('],
    ['  function relationshipGroups(', '\n  function eventTitle(']
  ]) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
  }
  return { state, context, family };
}

test('existing and new children are reciprocal siblings across records with the same parents', () => {
  const h = harness();
  const before = JSON.stringify([...h.state.families]);
  for (const id of ['A', 'B', 'C']) {
    const expected = ['A', 'B', 'C', 'H'].filter((other) => other !== id).sort();
    assert.deepEqual(Array.from(h.context.siblingsOf(id)).sort(), expected);
    const listed = h.context.relationshipGroups(h.state.people.get(id))[1][1];
    assert.deepEqual(Array.from(listed, (item) => item.id).sort(), expected);
    for (const item of listed) {
      assert.ok(h.state.families.get(item.familyId).childIds.includes(item.id));
    }
  }
  assert.equal(JSON.stringify([...h.state.families]), before);
});

test('shared recorded parents include half-siblings, not siblings of siblings or unrelated people', () => {
  const h = harness();
  h.family('F6', 'R', '', ['W']);
  assert.deepEqual(Array.from(h.context.siblingsOf('A')).sort(), ['B', 'C', 'H']);
  assert.deepEqual(Array.from(h.context.siblingsOf('H')).sort(), ['A', 'B', 'C', 'W']);
});

test('unknown parents never match across families, but recorded co-children remain siblings', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.context.siblingsOf('U')), ['V']);
  assert.deepEqual(Array.from(h.context.siblingsOf('W')), []);
  assert.deepEqual(Array.from(h.context.siblingsOf('absent')), []);
  h.family('F6', 'missing-parent', '', ['U']);
  h.family('F7', 'missing-parent', '', ['W', 'missing-child']);
  assert.deepEqual(Array.from(h.context.siblingsOf('U')), ['V']);
});

test('duplicate child references and overlapping family links do not duplicate siblings', () => {
  const h = harness();
  h.family('F6', 'P', 'Q', ['B', 'B', 'A']);
  assert.deepEqual(Array.from(h.context.siblingsOf('A')).sort(), ['B', 'C', 'H']);
});
