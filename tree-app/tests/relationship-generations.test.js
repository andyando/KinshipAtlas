'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const graphSource = source.slice(source.indexOf('  function renderGraph()'), source.indexOf('  function renderRoster()'));
const levelsSource = source.slice(source.indexOf('  function generationLevels('), source.indexOf('  function yearFrom('));

function harness({ children = false, childIds = null, grandchildren = {}, greatGrandparents = true, siblings = false, couple = false, partners = [] } = {}) {
  const focusChildren = childIds || (children ? ['child'] : []);
  const grandchildIds = Object.values(grandchildren).flat();
  const people = new Map([...new Set(['focus', 'parent', 'grandparent', 'great', 'wife', 'child', 'sibling', ...partners, ...focusChildren, ...grandchildIds])].map((id) => [id, { id, parentFamilyIds: [] }]));
  const offspring = new Map([['parent', siblings ? ['focus', 'sibling'] : ['focus']], ['grandparent', ['parent']], ['great', ['grandparent']], ['focus', focusChildren]]);
  for (const id of focusChildren) offspring.set(id, grandchildren[id] || []);
  for (const id of grandchildIds) if (!offspring.has(id)) offspring.set(id, []);
  people.get('grandparent').parentFamilyIds = ['great'];
  const parents = new Map([['focus', ['parent']], ['parent', ['grandparent']], ['grandparent', greatGrandparents ? (couple ? ['great', 'wife'] : ['great']) : []]]);
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
    scrollWidth: 1000, scrollHeight: 1000, clientWidth: 1000, clientHeight: 1000,
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
        husbandId: parent, wifeId: couple && parent === 'great' ? 'wife' : '', childIds,
        marriage: parent === 'focus' ? { type: 'MARR' } : null
      }]))
    },
    elements: { canvas, generationLabel: {}, graphSummary: {} },
    parentsOf: (id) => parents.get(id) || [],
    childrenOf: (id) => offspring.get(id) || [],
    siblingsOf: () => ['sibling'],
    partnersOf: () => partners.map((id) => ({ id })),
    sortedPeople: (ids) => [...ids].sort().map((id) => people.get(id)),
    appendGeneration(canvas, label, generation, people, relation, navigation, familyGroups, compact) {
      rows.push({ label, generation, ids: people.map((person) => person.id), navigation, familyGroups, compact: Boolean(compact) });
      for (const group of familyGroups || []) groups.set(group.familyId, {
        getBoundingClientRect: () => ({ left: 10, top: 0, bottom: 210, width: 240 })
      });
      for (const person of people) cards.set(`${generation}|${person.id}`, {
        getBoundingClientRect: () => ({ left: person.left || 0, right: (person.left || 0) + 240, top: (generation + 3) * 120, bottom: (generation + 3) * 120 + 90, width: 240, height: 90 })
      });
    },
    document: {
      createElementNS(namespace, tag) {
        if (tag === 'svg') return svg;
        return { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
      }
    },
    getComputedStyle: () => ({ zoom: '1' }),
    CSS: { escape: (id) => id },
    requestAnimationFrame: (callback) => callback()
  });
  vm.runInContext(levelsSource + graphSource, context);
  return { context, rows, paths, offspring, people };
}

test('relationship-map portrait uses the same saved hero crop and renders inside a square frame', () => {
  const sourceHasSharedCropRenderer = /loadHeroFrameState\(person\.id, primaryImage\.file\)[\s\S]*?createHeroFrameRenderer\(framing\)\.paintHero\(photo\)/.test(source);
  const sourceUsesSquarePortraitFrame = /card-photo-frame[\s\S]*?photoFrame\.append\(photo\)[\s\S]*?button\.append\(photoFrame\)/.test(source);
  const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.ok(sourceHasSharedCropRenderer, 'map portrait paints with the person record hero framing state');
  assert.ok(sourceUsesSquarePortraitFrame, 'map portrait is contained in a square crop frame');
  assert.match(styles, /\.card-photo-frame\s*\{[^}]*border-radius:\s*3px/s, 'map portrait frame is square');
});

test('grandchildren switch to compact cards only when more than seven are displayed', () => {
  const moreThanSeven = harness({ childIds: ['child'], grandchildren: { child: Array.from({ length: 8 }, (_, index) => `grandchild${index}`) } });
  moreThanSeven.context.renderGraph();
  assert.equal(moreThanSeven.rows.find((row) => row.generation === 2).compact, true);

  const seven = harness({ childIds: ['child'], grandchildren: { child: Array.from({ length: 7 }, (_, index) => `grandchild${index}`) } });
  seven.context.renderGraph();
  assert.equal(seven.rows.find((row) => row.generation === 2).compact, false);
});

test('relationship-map cards omit generic person titles and provide birth and death flags', () => {
  const rendererStart = source.indexOf('  function addPersonControl(');
  const rendererEnd = source.indexOf('  function appendGeneration(', rendererStart);
  const renderer = source.slice(rendererStart, rendererEnd);
  assert.ok(!renderer.includes("'Selected person'") && !renderer.includes("'Family member'"), 'generic titles are not rendered');
  assert.match(renderer, /\['Birth', birthCountry\], \['Death', deathCountry\]/, 'both event countries are rendered as flags');
});

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

test('siblings stay outside the selected person and partners instead of splitting couples by name', () => {
  const h = harness({ siblings: true, partners: ['spouse', 'zpartner'] });
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows.find((row) => row.generation === 0).ids), ['sibling', 'focus', 'spouse', 'zpartner']);
  h.context.state.showSiblings = false;
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows.find((row) => row.generation === 0).ids), ['focus', 'spouse', 'zpartner']);
});

test('siblings are on the right when their relative is on the right of the couple', () => {
  const h = harness({ siblings: true, partners: ['aspouse'] });
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows.find((row) => row.generation === 0).ids), ['aspouse', 'focus', 'sibling']);
});

test('without a partner, siblings remain beside the selected person', () => {
  const h = harness({ siblings: true });
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows.find((row) => row.generation === 0).ids), ['focus', 'sibling']);
});

test('a person listed as both partner and sibling is rendered only once', () => {
  const h = harness({ siblings: true, partners: ['sibling', 'spouse'] });
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows.find((row) => row.generation === 0).ids), ['focus', 'sibling', 'spouse']);
});

test('great-grandparent couples stack the wife first and use a single connector below the pair', () => {
  const h = harness({ couple: true });
  h.context.renderGraph();
  const groups = h.rows[0].familyGroups;
  assert.equal(groups.length, 1);
  assert.deepEqual(Array.from(groups[0].people, (person) => person.id), ['wife', 'great']);
  assert.equal(h.paths.length, 4);
  assert.equal(h.paths.filter((path) => path.attributes.class === 'marriage-link').length, 1);
  assert.equal(h.paths.filter((path) => /^M 130 210 C /.test(path.attributes.d)).length, 1);
  assert.equal(h.paths.filter((path) => path.attributes.class === 'parent-link').length, 3);
});

test('a lone recorded great-grandparent forms a single-card group', () => {
  const h = harness();
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows[0].familyGroups[0].people, (person) => person.id), ['great']);
});

for (const generation of [-3, -2, -1, 0, 1, 2]) {
  test(`spouse connectors do not require a marriage event in generation ${generation}`, () => {
    const h = harness({ partners: ['spouse'] });
    h.context.state.families = new Map([['couple', { husbandId: 'focus', wifeId: 'spouse', childIds: [], marriage: null }]]);
    h.context.appendGeneration(null, '', generation, [{ id: 'focus', left: 0 }, { id: 'spouse', left: 260 }]);
    const svg = {
      setAttribute() {}, replaceChildren() { h.paths.length = 0; },
      append(value) { h.paths.push(value); }
    };
    h.context.drawConnectors(svg, new Set([`${generation}|focus`, `${generation}|spouse`]), 'focus', []);
    assert.equal(h.paths.length, 1);
    assert.equal(h.paths[0].attributes.class, 'marriage-link');
    assert.match(h.paths[0].attributes.d, /^M 240 .* H 260$/);
  });
}

test('Show siblings starts off by default', () => {
  const h = harness();
  assert.equal(h.context.state.showSiblings, false);
  h.context.renderGraph();
  assert.deepEqual(Array.from(h.rows.find((row) => row.generation === 0).ids), ['focus']);
});

test('grandchildren are grouped beneath their closest parent in the displayed child order', () => {
  const h = harness({
    childIds: ['childC', 'childA', 'childB'],
    grandchildren: { childA: ['a1', 'a2'], childB: ['b1', 'b2'], childC: ['c1', 'c2'] }
  });
  h.context.renderGraph();
  const displayedChildren = Array.from(h.rows.find((row) => row.generation === 1).ids);
  const displayedGrandchildren = Array.from(h.rows.find((row) => row.generation === 2).ids);
  assert.deepEqual(displayedChildren, ['childC', 'childA', 'childB']);
  assert.deepEqual(displayedGrandchildren, displayedChildren.flatMap((id) => h.offspring.get(id)));
});

test('each displayed child-to-grandchildren family gets its own color, shared by that family’s lines', () => {
  const h = harness({
    childIds: ['childA', 'childB'],
    grandchildren: { childA: ['a1', 'a2'], childB: ['b1', 'b2'] }
  });
  h.context.renderGraph();
  const grandchildLinks = h.paths.filter((path) => path.attributes.class === 'parent-link' && path.attributes['data-parent-generation'] === '1');
  const colorsByFamily = new Map();
  for (const path of grandchildLinks) {
    const familyId = path.attributes['data-family-id'];
    const color = path.attributes.style;
    if (!colorsByFamily.has(familyId)) colorsByFamily.set(familyId, new Set());
    colorsByFamily.get(familyId).add(color);
  }
  assert.equal(colorsByFamily.size, 2);
  assert.equal(new Set([...colorsByFamily.values()].map((colors) => [...colors][0])).size, 2);
  assert.ok([...colorsByFamily.values()].every((colors) => colors.size === 1));
});
