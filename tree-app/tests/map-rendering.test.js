'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    // Timeline buttons keep their glyph/title in data attributes.
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' ').trim(); },
      remove: (name) => { this.className = this.className.split(' ').filter((entry) => entry !== name).join(' '); },
      toggle: (name, enabled) => { this.classList[enabled ? 'add' : 'remove'](name); }
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  getBoundingClientRect() { return { width: 900, height: 500, left: 0, top: 0 }; }
}

function find(node, predicate) {
  return [node, ...node.children.flatMap((child) => find(child, predicate))].filter(predicate);
}
const hasClass = (name) => (node) => node.className.split(' ').includes(name);
const text = (node) => node.textContent + node.children.map(text).join('');

function mapFixture({ clustered = false, primary = true } = {}) {
  const people = ['P', 'D', 'F', 'M', 'B', 'O', 'U'].map((id, index) => ({
    id, name: `Example ${id}`,
    events: id === 'U' ? [] : [{ type: 'BIRT', date: '1900', lat: 0, lon: clustered ? 0 : (index - 2) * 40 }]
  }));
  let groups = {
    all: new Set(['P', 'D', 'F', 'M', 'B', 'U']),
    paternal: new Set(['P', 'D', 'F', 'B', 'U']),
    maternal: new Set(['P', 'D', 'M', 'B']),
    descendants: new Set(['P', 'D'])
  };
  if (!primary) groups = undefined;
  let directory = people;
  let selected = 'P';
  const stats = [];
  const container = new Element('div');
  const icons = Object.fromEntries(['bloodline', 'maternal', 'paternal', 'descendants'].map((key) => {
    const icon = new Element('svg');
    icon.className = 'button-icon';
    icon.setAttribute('aria-hidden', 'true');
    return [key, icon];
  }));
  const icon = icons.bloodline;
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: {
      createElement: (tag) => new Element(tag),
      createElementNS: (namespace, tag) => new Element(tag),
      createTextNode: (value) => { const node = new Element('#text'); node.textContent = value; return node; }
    },
    requestAnimationFrame: () => 1,
    performance: { now: () => 0 }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'map.js'), 'utf8'), context);
  const map = context.window.KinshipMap.create({
    container, bloodlineIcons: icons, getPeople: () => directory, getBloodlines: () => groups,
    placeEventsFor: (person) => person.events, getSelectedId: () => selected,
    onSelect: (id) => { selected = id; }, describe: () => '1900-1980',
    eventLabel: () => 'Birth', onStatsChange: (value) => stats.push(value)
  });
  map.show();
  const toggles = find(container, (node) => node.attributes.role === 'switch');
  return {
    map, container, stats, icon, icons,
    toggles: Object.fromEntries(['bloodline', 'maternal', 'paternal', 'descendants'].map((key, index) => [key, toggles[index]])),
    setGroups: (value) => { groups = value; },
    setDirectory: (ids) => { directory = people.filter((person) => ids.includes(person.id)); },
    markers: () => find(container, hasClass('map-marker')),
    control: find(container, hasClass('map-bloodline-control'))[0],
    toggle: find(container, (node) => node.attributes.role === 'switch')[0]
  };
}

test('map renders each lineage, preserves descendant precedence and labels the legend and switch', () => {
  const fixture = mapFixture();
  const categories = fixture.markers().map((marker) => marker.className);
  for (const category of ['paternal', 'maternal', 'both', 'descendants', 'other']) {
    assert.ok(categories.some((classes) => classes.includes(`map-lineage-${category}`)), category);
  }
  assert.equal(categories.filter((classes) => classes.includes('map-lineage-descendants')).length, 2);
  const legend = find(fixture.container, hasClass('map-relative-legend'))[0];
  assert.equal(legend.hidden, false);
  assert.equal(find(legend, hasClass('map-legend-swatch')).length, 5);
  for (const label of ["Father's side", "Mother's side", 'Both sides', 'Primary person / descendants', 'Others']) {
    assert.ok(text(legend).includes(label), label);
  }
  assert.ok(fixture.control.children.includes(fixture.icon));
  assert.ok(text(fixture.control).includes('Bloodline only'));
  assert.equal(fixture.toggle.checked, false);
  assert.equal(fixture.toggle.disabled, false);
  const father = fixture.markers().find(hasClass('map-lineage-paternal'));
  assert.ok(father.attributes['aria-label'].includes("Father's side"));
  father.listeners.keydown({ key: 'Enter', preventDefault() {} });
  const popup = find(fixture.container, hasClass('map-popup'))[0];
  assert.equal(popup.hidden, false);
  assert.ok(text(popup).includes("Father's side"));
});

test('four labelled icon switches are stacked in order and all start off', () => {
  const fixture = mapFixture();
  const stack = find(fixture.container, hasClass('map-bloodline-filters'))[0];
  assert.equal(stack.attributes.role, 'group');
  assert.deepEqual(stack.children.map(text), ['Bloodline only', "Mother's side", "Father's side", 'Descendants']);
  for (const [key, toggle] of Object.entries(fixture.toggles)) {
    assert.equal(toggle.checked, false);
    assert.equal(toggle.disabled, false);
    assert.equal(toggle.type, 'checkbox');
    assert.ok(toggle.parentElement.children.includes(fixture.icons[key]));
    assert.equal(fixture.icons[key].attributes['aria-hidden'], 'true');
  }
});

test('all side-filter combinations select category unions, with or without Bloodline only', () => {
  const keys = ['maternal', 'paternal', 'descendants'];
  for (const bloodlineOnly of [false, true]) {
    for (let mask = 0; mask < 8; mask++) {
      const fixture = mapFixture();
      const change = (key, checked) => {
        fixture.toggles[key].checked = checked;
        fixture.toggles[key].listeners.change();
      };
      change('bloodline', bloodlineOnly);
      keys.forEach((key, index) => { if (mask & (1 << index)) change(key, true); });
      const expected = mask === 0
        ? bloodlineOnly ? ['P', 'D', 'F', 'M', 'B'] : ['P', 'D', 'F', 'M', 'B', 'O']
        : [
          ...(mask & 1 ? ['M'] : []),
          ...(mask & 2 ? ['F'] : []),
          ...(mask & 3 ? ['B'] : []),
          ...(mask & 4 ? ['P', 'D'] : [])
        ];
      const actual = fixture.markers().flatMap((marker) => marker.pinsRef.map((pin) => pin.person.id));
      assert.deepEqual(actual.sort(), expected.sort(), `Bloodline only=${bloodlineOnly}, sides=${mask}`);
      const stats = fixture.stats.at(-1);
      assert.equal(stats.placed, expected.length);
      assert.equal(stats.unplaced, !mask || (mask & 2) ? 1 : 0);
      for (const key of keys) change(key, false);
      assert.equal(fixture.markers().length, bloodlineOnly ? 5 : 6);
      assert.equal(fixture.toggles.bloodline.checked, bloodlineOnly);
    }
  }
});

test('side filters intersect Directory results, update unplaced lists and reset without a primary person', () => {
  const fixture = mapFixture();
  fixture.toggles.paternal.checked = true;
  fixture.toggles.paternal.listeners.change();
  fixture.setDirectory(['F', 'O', 'U']);
  let stats = fixture.map.refresh();
  assert.equal(stats.placed, 1);
  assert.equal(stats.unplaced, 1);
  const status = find(fixture.container, hasClass('map-status'))[0];
  status.listeners.click();
  const popup = find(fixture.container, hasClass('map-popup'))[0];
  assert.ok(text(popup).includes('Example U'));
  fixture.toggles.paternal.checked = false;
  fixture.toggles.paternal.listeners.change();
  fixture.toggles.maternal.checked = true;
  fixture.toggles.maternal.listeners.change();
  assert.equal(popup.hidden, true);
  assert.equal(fixture.stats.at(-1).placed, 0);
  assert.equal(fixture.stats.at(-1).unplaced, 0);
  fixture.setGroups(undefined);
  stats = fixture.map.refresh();
  for (const toggle of Object.values(fixture.toggles)) {
    assert.equal(toggle.checked, false);
    assert.equal(toggle.disabled, true);
  }
  assert.equal(stats.placed, 2);
  assert.equal(stats.unplaced, 1);
  fixture.setGroups({
    all: new Set(['F']), maternal: new Set(['F']), paternal: new Set(), descendants: new Set()
  });
  fixture.map.refresh();
  for (const toggle of Object.values(fixture.toggles)) {
    assert.equal(toggle.checked, false);
    assert.equal(toggle.disabled, false);
  }
});

test('mixed clusters render all category segments and expose category counts and list badges', () => {
  const fixture = mapFixture({ clustered: true });
  const [cluster] = fixture.markers();
  assert.equal(fixture.markers().length, 1);
  assert.ok(hasClass('map-lineage-mixed')(cluster));
  assert.ok(hasClass('map-marker-selected')(cluster));
  const slices = find(cluster, hasClass('map-lineage-slice'));
  assert.equal(slices.length, 5);
  for (const slice of slices) assert.ok(!/NaN|undefined|Infinity/.test(slice.attributes.d));
  assert.ok(cluster.attributes['aria-label'].includes('2 Primary person / descendants'));
  assert.ok(cluster.attributes['aria-label'].includes("1 Father's side"));
  cluster.listeners.keydown({ key: ' ', preventDefault() {} });
  const badges = find(fixture.container, hasClass('map-popup-lineage'));
  assert.equal(badges.length, 6);
  assert.equal(badges.filter(hasClass('map-lineage-descendants')).length, 2);
});

test('slider filters pins and unplaced list, intersects directory and reports updated stats', () => {
  const fixture = mapFixture();
  fixture.toggle.checked = true;
  fixture.toggle.listeners.change();
  assert.equal(fixture.markers().length, 5);
  assert.equal(fixture.stats[0].placed, 5);
  assert.equal(fixture.stats[0].unplaced, 1);
  assert.ok(!fixture.markers().some(hasClass('map-lineage-other')));
  const status = find(fixture.container, hasClass('map-status'))[0];
  status.listeners.click();
  assert.ok(text(find(fixture.container, hasClass('map-popup'))[0]).includes("Father's side"));
  fixture.setDirectory(['F', 'O', 'U']);
  const stats = fixture.map.refresh();
  assert.equal(stats.placed, 1);
  assert.equal(stats.unplaced, 1);
  fixture.setGroups(undefined);
  fixture.map.refresh();
  assert.equal(fixture.toggle.checked, false);
  assert.equal(fixture.toggle.disabled, true);
  assert.equal(fixture.markers().length, 2);
  assert.equal(find(fixture.container, hasClass('map-relative-legend'))[0].hidden, true);
});

test('without a primary person, colours and labels remain unclassified', () => {
  const fixture = mapFixture({ primary: false });
  assert.equal(fixture.toggle.disabled, true);
  assert.ok(fixture.markers().every((marker) => !marker.className.includes('map-lineage-')));
  assert.ok(fixture.markers().every((marker) => !marker.attributes['aria-label'].includes('side')));
});

test('refresh dismisses a popup whose lineage label changed with the primary person', () => {
  const fixture = mapFixture();
  const marker = fixture.markers().find(hasClass('map-lineage-paternal'));
  marker.listeners.keydown({ key: 'Enter', preventDefault() {} });
  const popup = find(fixture.container, hasClass('map-popup'))[0];
  assert.equal(popup.hidden, false);
  fixture.map.refresh();
  assert.equal(popup.hidden, false);
  fixture.setGroups({
    all: new Set(['F']), paternal: new Set(), maternal: new Set(), descendants: new Set(['F'])
  });
  fixture.map.refresh();
  assert.equal(popup.hidden, true);
  const updated = fixture.markers().find((node) => node.attributes['aria-label'].startsWith('Example F,'));
  assert.ok(hasClass('map-lineage-descendants')(updated));
});
