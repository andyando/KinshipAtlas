'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('person records no longer expose the separate starred home-person action', () => {
  assert.ok(!source.includes('dataset.homePerson'));
  assert.ok(!source.includes('data-home-person'));
  assert.ok(!source.includes('toggleHomePerson'));
  assert.ok(source.includes('primaryPersonButton.dataset.primaryPerson = person.id'));
  assert.ok(source.includes('setFocus(record.homePersonId, true)'));
});

test('primary-person selection and clearing preserve saved startup preferences', () => {
  const defaultRecord = { homePersonId: 'START', homePersonName: 'Startup person' };
  const state = {
    primaryPersonId: '',
    people: new Map([['P', { id: 'P', name: 'Example person' }]]),
    defaultRecord
  };
  const selections = [];
  let refreshes = 0;
  const context = vm.createContext({
    state,
    primaryPersonStorageKey: () => 'primary',
    storeSelection: (key, value) => { selections.push({ key, value }); return true; },
    syncPrimaryPersonBar() {},
    renderDetails() {},
    refreshMapView: () => { refreshes++; },
    showToast() {}
  });
  const start = source.indexOf('  function togglePrimaryPerson(');
  const end = source.indexOf('  function showCardImageChoices(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  context.togglePrimaryPerson('P');
  assert.equal(state.primaryPersonId, 'P');
  assert.equal(selections[0].value.id, 'P');
  context.togglePrimaryPerson('P');
  assert.equal(state.primaryPersonId, '');
  assert.equal(selections[1].value, null);
  assert.equal(refreshes, 2);
  assert.equal(state.defaultRecord, defaultRecord);
  assert.equal(state.defaultRecord.homePersonId, 'START');
});
