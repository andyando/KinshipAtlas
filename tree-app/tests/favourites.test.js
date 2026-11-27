'use strict';
// Favourites: storage shapes and migration, sorting rules, search, and the
// persisted sort choice. Each function under test is sliced out of app.js and
// run against small stubs, the same way the other view tests work.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing ${startMarker}`);
  return source.slice(start, end);
}

// The pure helpers: normalisation, ordering and the count wording.
function harness({ people = [], favourites = null, store = {} } = {}) {
  const saves = [];
  const context = vm.createContext({
    state: { people: new Map(people.map((person) => [person.id, person])), selectedId: null, fileName: 'tree.ged' },
    readSelection: (key) => (key in store ? store[key] : null),
    storeSelection: (key, value) => { saves.push({ key, value }); return true; },
    normalizeDirectoryName: (text) => String(text || '').toLocaleLowerCase(),
    showToast() { },
    renderDetails() { },
    renderRoster() { },
    renderFavourites() { },
    syncFavouritesControls() { },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    window: {},
    console
  });
  const start = source.indexOf('const favouritesStorageKey =');
  const end = source.indexOf('const favouritesViewElement = document.querySelector(', start);
  assert.ok(start >= 0 && end > start, 'missing the favourites block');
  const body = source.slice(start, end);
  vm.runInContext(body + '\n' + 'this.api = { normalizeFavouriteEntries, loadFavourites, saveFavourites, toggleFavourite, isFavourite, favouriteCount, compareFavourites, favouriteSurname, favouriteGiven, favouriteBirthYear, favouritesCountText, favouritePeople, favouritesMap, setSort: (value) => { favouritesSort = value; }, getSort: () => favouritesSort };', context);
  if (favourites !== null) store['kinship-atlas:favourites:v1'] = favourites;
  return { api: context.api, saves, context, store };
}

function person(id, given, surname, birth = '') {
  return {
    id,
    name: `${given} ${surname}`,
    givenName: given,
    surname,
    events: birth ? [{ type: 'BIRT', date: birth, place: '' }] : []
  };
}

test('an older list of person ids is migrated without losing anyone', () => {
  const { api } = harness();
  const migrated = api.normalizeFavouriteEntries({ favourites: ['I123', 'I456'] });
  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), [
    { personId: 'I123', addedDate: '' },
    { personId: 'I456', addedDate: '' }
  ]);
});

test('the current shape, @-wrapped ids and duplicates are all handled', () => {
  const { api } = harness();
  const entries = api.normalizeFavouriteEntries({
    favourites: [
      { personId: 'I1', addedDate: '2026-11-27T12:00:00Z' },
      { personId: '@I2@', addedDate: null },
      { personId: 'I1', addedDate: '2026-11-28T00:00:00Z' },
      { personId: '', addedDate: '' },
      null,
      { id: 'I3' }
    ]
  });
  assert.deepEqual(JSON.parse(JSON.stringify(entries)), [
    { personId: 'I1', addedDate: '2026-11-27T12:00:00Z' },
    { personId: 'I2', addedDate: '' },
    { personId: 'I3', addedDate: '' }
  ]);
});

test('a corrupt favourites record never throws and loads as empty', () => {
  const { api } = harness({ store: { 'kinship-atlas:favourites:v1': { favourites: 'not a list' } } });
  api.loadFavourites();
  assert.equal(api.favouriteCount(), 0);
});

test('toggling writes personId + addedDate, and the sort choice rides along', () => {
  const { api, saves } = harness({ people: [person('I1', 'Ada', 'Allnutt')] });
  api.loadFavourites();
  assert.equal(api.toggleFavourite('I1'), true);
  assert.equal(api.isFavourite('I1'), true);
  const saved = saves.at(-1).value;
  assert.equal(saved.favourites.length, 1);
  assert.equal(saved.favourites[0].personId, 'I1');
  assert.match(saved.favourites[0].addedDate, /^\d{4}-\d{2}-\d{2}T/);
  api.setSort('surname-asc');
  api.saveFavourites();
  assert.equal(saves.at(-1).value.sort, 'surname-asc');
  assert.equal(api.toggleFavourite('I1'), false);
  assert.equal(api.isFavourite('I1'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(saves.at(-1).value.favourites)), []);
});

test('favourites pointing at people who left the tree are counted but not shown', () => {
  const { api } = harness({
    people: [person('I1', 'Ada', 'Allnutt')],
    store: { 'kinship-atlas:favourites:v1': { favourites: ['I1', 'GONE'] } }
  });
  api.loadFavourites();
  assert.equal(api.favouriteCount(), 2);
  assert.deepEqual(Array.from(api.favouritePeople(), (p) => p.id), ['I1']);
});

test('surname sort orders by surname, then given name, then birth year', () => {
  const { api } = harness();
  const entries = [
    { person: person('I3', 'Andrew', 'Anderson', '1837'), addedDate: '' },
    { person: person('I1', 'Margaret', 'Anderson', '1815'), addedDate: '' },
    { person: person('I2', 'Alfred', 'Bell', '1802'), addedDate: '' }
  ];
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'surname-asc')).map((e) => e.person.name),
    ['Andrew Anderson', 'Margaret Anderson', 'Alfred Bell']);
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'surname-desc')).map((e) => e.person.name),
    ['Alfred Bell', 'Margaret Anderson', 'Andrew Anderson']);
});

test('first-name sort orders by given name, then surname', () => {
  const { api } = harness();
  const entries = [
    { person: person('I1', 'Margaret', 'Anderson'), addedDate: '' },
    { person: person('I2', 'Alfred', 'Bell'), addedDate: '' },
    { person: person('I3', 'Andrew', 'Anderson'), addedDate: '' }
  ];
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'given-asc')).map((e) => e.person.name),
    ['Alfred Bell', 'Andrew Anderson', 'Margaret Anderson']);
});

test('year sort puts unknown birth years last in both directions', () => {
  const { api } = harness();
  const entries = [
    { person: person('I1', 'A', 'One', '1980'), addedDate: '' },
    { person: person('I2', 'B', 'Two', ''), addedDate: '' },
    { person: person('I3', 'C', 'Three', '1802'), addedDate: '' }
  ];
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'year-asc')).map((e) => e.person.name),
    ['C Three', 'A One', 'B Two']);
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'year-desc')).map((e) => e.person.name),
    ['A One', 'C Three', 'B Two']);
});

test('recently-added sort uses addedDate, with records that lack one treated as oldest', () => {
  const { api } = harness();
  const entries = [
    { person: person('I1', 'A', 'One'), addedDate: '2026-11-01T10:00:00Z' },
    { person: person('I2', 'B', 'Two'), addedDate: '2026-11-05T10:00:00Z' },
    { person: person('I3', 'C', 'Three'), addedDate: '' }
  ];
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'added-desc')).map((e) => e.person.name),
    ['B Two', 'A One', 'C Three']);
  assert.deepEqual(entries.sort((a, b) => api.compareFavourites(a, b, 'added-asc')).map((e) => e.person.name),
    ['C Three', 'A One', 'B Two']);
});

test('the count summary reads naturally at 0, 1 and many', () => {
  const { api } = harness();
  assert.equal(api.favouritesCountText(0), 'No favourite people');
  assert.equal(api.favouritesCountText(1), '1 favourite person');
  assert.equal(api.favouritesCountText(27), '27 favourite people');
});
