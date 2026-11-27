'use strict';
// Regression: partnerships recorded on only one side of the family must still
// surface in the "other parent from a spouse relationship" dropdown.
// Example from Ancestry_01112026.ged: F718 has HUSB Erwin + WIFE Ilse, but only
// Erwin's INDI carries `1 FAMS @F718@`; Ilse's does not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness() {
  const context = vm.createContext({
    state: {
      people: new Map([
        ['I_ERWIN', { id: 'I_ERWIN', name: 'Erwin Nehm', spouseFamilyIds: ['F718'] }],
        ['I_ILSE', { id: 'I_ILSE', name: 'Ilse Magnus', spouseFamilyIds: [] }]
      ]),
      families: new Map([
        ['F718', { id: 'F718', husbandId: 'I_ERWIN', wifeId: 'I_ILSE', childIds: [] }]
      ])
    }
  });
  const start = source.indexOf('  function partnersOf(');
  const end = source.indexOf('  function childrenOf(', start);
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('partnersOf finds the partner from the FAM record when the INDI lacks FAMS', () => {
  const h = harness();
  const forErwin = h.partnersOf('I_ERWIN').map((partner) => partner.id).sort();
  const forIlse = h.partnersOf('I_ILSE').map((partner) => partner.id).sort();
  assert.deepEqual([...forErwin], ['I_ILSE']);
  assert.deepEqual([...forIlse], ['I_ERWIN']);
});
