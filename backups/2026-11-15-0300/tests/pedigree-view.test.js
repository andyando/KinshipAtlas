'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Extract the pedigree helpers straight from app.js so the tests exercise the
// real production logic.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  // ---------- Pedigree view ----------');
const end = source.indexOf('  function setPedigreeMode(on)');
assert.ok(start > 0 && end > start, 'pedigree helpers not found in app.js');

function buildHarness(people, families) {
  const state = {
    people: new Map(people), families: new Map(families), selectedId: '',
    primaryPersonId: '', mediaLibraryMode: false, reportsMode: false, mapMode: false
  };
  const parentsOf = (personId) => {
    const person = state.people.get(personId);
    if (!person) return [];
    const result = [];
    for (const familyId of person.parentFamilyIds || []) {
      const family = state.families.get(familyId);
      if (!family) continue;
      for (const parentId of [family.husbandId, family.wifeId]) {
        if (parentId && state.people.has(parentId) && !result.includes(parentId)) result.push(parentId);
      }
    }
    return result;
  };
  const context = vm.createContext({ state, parentsOf, countryFlagForPlace: () => null });
  vm.runInContext(`${source.slice(start, end)}\nthis.api = { pedigreeGenerations };`, context);
  return context.api;
}

const personEntry = (id, extra = {}) => [id, { id, name: `Person ${id}`, events: [], parentFamilyIds: [], ...extra }];
const familyEntry = (id, extra = {}) => [id, { id, husbandId: '', wifeId: '', childIds: [], ...extra }];

test('a person with no parents yields a single generation row', () => {
  const api = buildHarness([personEntry('A', { parentFamilyIds: ["F1"] })], []);
  const rows = api.pedigreeGenerations('A', 4);
  assert.equal(JSON.stringify(rows), JSON.stringify([['A']]));
});

test('a person with one known parent gets a placeholder slot, stopping at the empty generation', () => {
  const api = buildHarness(
    [personEntry('A', { parentFamilyIds: ["F1"] }), personEntry('M', { parentFamilyIds: [] })],
    [familyEntry('F1', { wifeId: 'M', childIds: ['A'] })]
  );
  const rows = api.pedigreeGenerations('A', 4);
  assert.equal(JSON.stringify(rows), JSON.stringify([['A'], ['M', '']]));
});

test('four generations include the person, parents, grandparents and great-grandparents', () => {
  const api = buildHarness(
    [
      personEntry('A', { parentFamilyIds: ["F1"] }), personEntry('P1', { parentFamilyIds: ["F2"] }), personEntry('P2', { parentFamilyIds: ["F3"] }),
      personEntry('G1', { parentFamilyIds: ["F4"] }), personEntry('G2', { parentFamilyIds: ["F5"] }), personEntry('G3', { parentFamilyIds: ["F6"] }), personEntry('G4', { parentFamilyIds: ["F7"] }),
      personEntry('S1', { parentFamilyIds: [] }), personEntry('S2', { parentFamilyIds: [] }), personEntry('S3', { parentFamilyIds: [] }), personEntry('S4', { parentFamilyIds: [] }),
      personEntry('S5', { parentFamilyIds: [] }), personEntry('S6', { parentFamilyIds: [] }), personEntry('S7', { parentFamilyIds: [] }), personEntry('S8', { parentFamilyIds: [] })
    ],
    [
      familyEntry('F1', { husbandId: 'P1', wifeId: 'P2', childIds: ['A'] }),
      familyEntry('F2', { husbandId: 'G1', wifeId: 'G2', childIds: ['P1'] }),
      familyEntry('F3', { husbandId: 'G3', wifeId: 'G4', childIds: ['P2'] }),
      familyEntry('F4', { husbandId: 'S1', wifeId: 'S2', childIds: ['G1'] }),
      familyEntry('F5', { husbandId: 'S3', wifeId: 'S4', childIds: ['G2'] }),
      familyEntry('F6', { husbandId: 'S5', wifeId: 'S6', childIds: ['G3'] }),
      familyEntry('F7', { husbandId: 'S7', wifeId: 'S8', childIds: ['G4'] })
    ]
  );
  const rows = api.pedigreeGenerations('A', 4);
  assert.equal(rows.length, 4, 'four generation rows');
  assert.equal(JSON.stringify(rows[0]), JSON.stringify(['A']));
  assert.equal(JSON.stringify(rows[1]), JSON.stringify(['P1', 'P2']));
  assert.equal(JSON.stringify(rows[2]), JSON.stringify(['G1', 'G2', 'G3', 'G4']));
  assert.equal(JSON.stringify(rows[3]), JSON.stringify(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']));
});

test('siblings in one generation each keep their shared parents', () => {
  // Julius and Daniel Magnus are both children of the same couple. The second
  // sibling's parent slots must not be blanked, or their connector lines vanish.
  const api = buildHarness(
    [
      personEntry('CHILD', { parentFamilyIds: ['F1'] }),
      personEntry('JULIUS', { parentFamilyIds: ['F20'] }),
      personEntry('DANIEL', { parentFamilyIds: ['F20'] }),
      personEntry('MOTHER', { parentFamilyIds: [] }),
      personEntry('FATHER', { parentFamilyIds: [] })
    ],
    [
      // The selected person's parents are the two siblings Julius and Daniel.
      familyEntry('F1', { husbandId: 'JULIUS', wifeId: 'DANIEL', childIds: ['CHILD'] }),
      // Both siblings point at the same parent family.
      familyEntry('F20', { husbandId: 'FATHER', wifeId: 'MOTHER', childIds: ['JULIUS', 'DANIEL'] })
    ]
  );
  const rows = api.pedigreeGenerations('CHILD', 4);
  // Generation 1 holds the siblings; generation 2 holds each one's copy of the
  // shared couple, which must not be blanked for the second sibling.
  assert.equal(JSON.stringify(rows[1]), JSON.stringify(['JULIUS', 'DANIEL']));
  const sharedRow = rows[2] || [];
  assert.equal(sharedRow.filter((id) => id === 'FATHER').length, 2, 'both siblings carry a copy of the shared father');
  assert.equal(sharedRow.filter((id) => id === 'MOTHER').length, 2, 'both siblings carry a copy of the shared mother');
  assert.equal(sharedRow.length, 4, 'no blank slots are emitted for the second sibling');
});

test('an empty slot in a generation still contributes two empty parent slots', () => {
  // Keeps row lengths aligned so connectors can pair each child with its
  // own two parent slots by position.
  const api = buildHarness(
    [personEntry('A', { parentFamilyIds: ['F1'] }), personEntry('P', { parentFamilyIds: [] })],
    [familyEntry('F1', { husbandId: 'P', childIds: ['A'] })]
  );
  const rows = api.pedigreeGenerations('A', 4);
  assert.equal(JSON.stringify(rows), JSON.stringify([['A'], ['P', '']]));
});
