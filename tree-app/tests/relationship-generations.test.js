'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const graphSource = source.slice(source.indexOf('  function renderGraph()'), source.indexOf('  function renderRoster()'));
const levelsSource = source.slice(source.indexOf('  function generationLevels('), source.indexOf('  function yearFrom('));

function harness({ children = false, greatGrandparents = true, siblings = false, couple = false } = {}) {
  const people = new Map(['focus', 'parent', 'grandparent', 'great', 'wife', 'child', 'sibling'].map((id) => [id, { id, parentFamilyIds: [] }]));
  people.get('grandparent').parentFamilyIds = ['great'];
  const parents = new Map([['focus', ['parent']], ['parent', ['grandparent']], ['grandparent', greatGrandparents ? (couple ? ['great', 'wife'] : ['great']) : []]]);
  const offspring = new Map([['parent', ['focus', 'sibling']], ['grandparent', ['parent']], ['great', ['grandparent']], ['focus', children ? ['child'] : []]]);
  const rows = [];
  const cards = new Map();
  const groups = new Map();
  const paths = [];
  const svg = {
    classList: { add() {} },
    setAttribute() {},
    replaceChildren() { paths.length = 0; },
    append(value) { paths.push(value); }
  };
  const canvas = {
    scrollWidth: 1000, scrollHeight: 1000,
    replaceChildren() { rows.length = 0; cards.clear(); groups.clear(); },
    prepend() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
    querySelectorAll: () => [],
    querySelector(selector) {
      if (selector.startsWith('.ancestor-couple')) {
        return groups.get(selector.match(/data-family-id="([^"]+)"/)[1]) || null;
      }
      const match = selector.match(/data-generation="(-?\d+)".*data-person-id="([^"]+)"/);
      return cards.get(`${match[1]}|${match[2]}`) || null;
    }
  };
  const context = vm.createContext({
    state: {
      selectedId: 'focus', people, showSiblings: siblings,
      families: new Map([...offspring].map(([parent, childIds]) => [parent, {
        husbandId: parent, wifeId: couple && parent === 'great' ? 'wife' : '', childIds
      }]))
    },
    elements: { canvas, generationLabel: {}, graphSummary: {} },
    parentsOf: (id) => parents.get(id) || [],
    childrenOf: (id) => offspring.get(id) || [],
    siblingsOf: () => ['sibling'],
    partnersOf: () => [],
    sortedPeople: (ids) => [...ids].sort().map((id) => people.get(id)),
    appendGeneration(canvas, label, generation, people, relation, navigation, familyGroups) {
      rows.push({ label, generation, ids: people.map((person) => person.id), navigation, familyGroups });
      for (const group of familyGroups || []) groups.set(group.familyId, {
        getBoundingClientRect: () => ({ left: 10, top: 0, bottom: 210, width: 240 })
      });
      for (const person of people) cards.set(`${generation}|${person.id}`, {
        getBoundingClientRect: () => ({ left: 0, top: (generation + 3) * 120, bottom: (generation + 3) * 120 + 90, width: 240 })
      });
    },
    document: {
      createElementNS(namespace, tag) {
        if (tag === 'svg') return svg;
        return { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
      }
    },
    CSS: { escape: (id) => id },
    requestAnimationFrame: (callback) => callback()
  });
  vm.runInContext(levelsSource + graphSource, context);
  return { context, rows, paths };
}

test('a person without children shows great-grandparents and all ancestor connectors', () => {
  const h = harness();
  h.context.renderGraph();
  assert.deepEqual(h.rows.map((row) => row.generation), [-3, -2, -1, 0]);
  assert.equal(h.rows[0].label, 'Great-grandparents');
  assert.equal(h.rows[0].navigation.up, true);
  assert.equal(h.paths.length, 3);
  assert.match(h.context.elements.graphSummary.textContent, /^4 PEOPLE IN VIEW/);
});

test('a person with children keeps the usual ancestor depth and descendant rows', () => {
  const h = harness({ children: true });
  h.context.renderGraph();
  assert.deepEqual(h.rows.map((row) => row.generation), [-2, -1, 0, 1]);
  assert.equal(h.paths.length, 3);
});

test('missing great-grandparent records do not create an empty row', () => {
  const h = harness({ greatGrandparents: false });
  h.context.renderGraph();
  assert.deepEqual(h.rows.map((row) => row.generation), [-2, -1, 0]);
  assert.equal(h.paths.length, 2);
});

test('siblings do not prevent extra ancestors and focusing a parent recalculates the layout', () => {
  const h = harness({ siblings: true });
  h.context.renderGraph();
  assert.equal(h.rows[0].generation, -3);
  assert.ok(h.rows.find((row) => row.generation === 0).ids.includes('sibling'));
  h.context.state.selectedId = 'parent';
  h.context.renderGraph();
  assert.ok(!h.rows.some((row) => row.generation === -3));
  assert.ok(h.rows.some((row) => row.generation === 1));
});

test('great-grandparent couples stack the wife first and use a single connector below the pair', () => {
  const h = harness({ couple: true });
  h.context.renderGraph();
  const groups = h.rows[0].familyGroups;
  assert.equal(groups.length, 1);
  assert.deepEqual(Array.from(groups[0].people, (person) => person.id), ['wife', 'great']);
  assert.equal(h.paths.length, 3);
  assert.equal(h.paths.filter((path) => /^M 130 210 C /.test(path.attributes.d)).length, 1);
});

test('a lone recorded great-grandparent forms a single-card group', () => {
  const h = harness();
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows[0].familyGroups[0].people, (person) => person.id), ['great']);
});
