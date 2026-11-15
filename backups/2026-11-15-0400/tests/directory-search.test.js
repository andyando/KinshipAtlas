'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('    const searchTerms =', source.indexOf('  function renderRoster()'));
const end = source.indexOf('    elements.peopleList.replaceChildren();', start);

function search(query, surnameFilter = []) {
  const people = [
    { id: '1', name: 'Alex Morgan Taylor', surname: 'Taylor', events: [] },
    { id: '2', name: 'Alex Jamie Lee Taylor', surname: 'Taylor', events: [] },
    { id: '3', name: 'Alex Morgan Jones', surname: 'Jones', events: [] }
  ];
  const context = vm.createContext({
    state: {
      searchText: query, people: new Map(people.map((person) => [person.id, person])),
      surnameFilter: new Set(surnameFilter), directoryFilters: {}, directoryYearBounds: {}
    },
    normalizeDirectoryName: (value) => String(value || '').toLocaleLowerCase(),
    matchesOccupationType: () => true, countryFlagForPlace: () => null, yearFrom: () => ''
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.ids = matches.map(person => person.id);', context);
  return Array.from(context.ids);
}

test('directory finds first and last names with one or several omitted middle names', () => {
  assert.deepEqual(search('Alex Taylor'), ['2', '1']);
  assert.deepEqual(search('  ALEX   taylor  '), ['2', '1']);
  assert.deepEqual(search('Taylor Alex'), ['2', '1']);
  assert.deepEqual(search('Alex Morgan Taylor'), ['1']);
});

test('directory retains partial-name, empty-query and other-filter behavior', () => {
  assert.deepEqual(search('Tay'), ['2', '1']);
  assert.deepEqual(search(''), ['3', '2', '1']);
  assert.deepEqual(search('Alex Taylor', ['jones']), []);
  assert.deepEqual(search('Alex Missing'), []);
});

test('full Directory rendering works with empty and nonempty search and expands matching groups', () => {
  function node() {
    return {
      children: [], dataset: {}, hidden: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute() {}
    };
  }
  for (const query of ['', 'Alex Taylor']) {
    const list = node();
    const context = vm.createContext({
      state: {
        searchText: query, people: new Map([['I1', {
          id: 'I1', name: 'Alex Morgan Taylor', surname: 'Taylor', sex: '', events: []
        }]]),
        surnameFilter: new Set(), expandedSurnames: new Set(),
        directoryFilters: {}, directoryYearBounds: {}, selectedId: 'I1'
      },
      elements: { peopleList: list, visibleCount: node(), clearSurnameFilter: node() },
      document: { createElement: node, createDocumentFragment: node },
      normalizeDirectoryName: (value) => String(value || '').toLocaleLowerCase(),
      matchesOccupationType: () => true, countryFlagForPlace: () => null, yearFrom: () => '',
      refreshMapView() {}, makeButton: node, initials: () => 'AT', lifespan: () => ''
    });
    const renderStart = source.indexOf('  function renderRoster()');
    const renderEnd = source.indexOf('  function countryOptionsFor(', renderStart);
    vm.runInContext(source.slice(renderStart, renderEnd) + '\nrenderRoster();', context);
    assert.equal(context.state.directoryMatches.length, 1);
    const group = list.children[0].children[0];
    assert.equal(group.className, 'surname-group');
    assert.equal(group.children[1].hidden, !query);
  }
});
