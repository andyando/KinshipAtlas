'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function evaluateSource(startMarker, endMarker, exportExpression) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  const context = vm.createContext({});
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.result = ${exportExpression};`, context);
  return context.result;
}

test('large Media Library renders only the current page and keeps matching selections across pages', () => {
  const entries = Array.from({ length: 2793 }, (_, index) => {
    const path = `image-${String(index).padStart(4, '0')}.jpg`;
    return { key: path, path, searchText: path };
  });
  const fields = new Map();
  const field = (id) => {
    if (!fields.has(id)) fields.set(id, { value: '', focus() {}, scrollIntoView() {} });
    return fields.get(id);
  };
  const pager = { querySelector: field };
  const state = {
    people: new Map(), mediaLibraryMode: true, mediaLibraryPage: 0,
    mediaLibrarySort: 'name-asc', mediaTypes: new Map(),
    mediaLibrarySelected: new Set([entries.at(-1).key])
  };
  let cards;
  const elements = {
    mediaLibraryView: { querySelectorAll: () => [pager], querySelector: () => pager },
    mediaLibraryContent: { replaceChildren: (content) => { cards = content.children || []; } }
  };
  const context = vm.createContext({
    state, elements, clearTimeout,
    document: {
      querySelector: field,
      createElement: () => ({}),
      createDocumentFragment: () => ({
        children: [],
        append(card) { this.children.push(card); }
      })
    },
    getMediaLibraryEntries: () => entries,
    createMediaLibraryCard: (entry) => entry.key
  });
  const start = source.indexOf('  const mediaLibraryPageSize');
  const end = source.indexOf('  function createMediaLibraryCard', start);
  const { renderMediaLibrary, changeMediaLibraryPage } = vm.runInContext(
    `${source.slice(start, end)}\n({ renderMediaLibrary, changeMediaLibraryPage });`, context
  );
  renderMediaLibrary();
  assert.deepEqual(cards, entries.slice(0, 60).map(({ key }) => key));
  assert.equal(field('[data-media-page="-1"]').disabled, true);

  changeMediaLibraryPage(1);
  assert.deepEqual(cards, entries.slice(60, 120).map(({ key }) => key));
  assert.equal(state.mediaLibrarySelected.size, 1);
  assert.equal(field('.media-library-page-status').textContent, 'Page 2 of 47');

  state.mediaLibraryPage = 46;
  renderMediaLibrary();
  assert.deepEqual(cards, entries.slice(2760).map(({ key }) => key));
  assert.equal(field('[data-media-page="1"]').disabled, true);

  field('#mediaLibrarySearch').value = 'image-0000';
  renderMediaLibrary();
  assert.deepEqual(cards, [entries[0].key]);
  assert.equal(pager.hidden, true);
  assert.equal(state.mediaLibrarySelected.size, 0);

  field('#mediaLibrarySearch').value = 'no matches';
  renderMediaLibrary();
  assert.equal(cards.length, 0);
  assert.equal(field('#mediaLibrarySelectAllButton').disabled, true);
});

test('media classifications are sorted alphabetically by displayed label', () => {
  const options = evaluateSource(
    '  const mediaTypeOptions = [',
    '\n  const mediaTypeStorageKey',
    'mediaTypeOptions'
  );
  const labels = Array.from(options, ([, label]) => label);
  assert.deepEqual(labels, [...labels].sort((left, right) => left.localeCompare(right)));
  assert.ok(options.some(([value, label]) => value === 'electoral-roll' && label === 'Electoral roll'));
  assert.ok(options.some(([value, label]) => value === 'petition' && label === 'Petition'));
});

test('profile image review recommends the first attached Portrait when the displayed hero is not a Portrait', () => {
  const people = [
    ['A', { id: 'A', mediaPaths: ['document.jpg', 'portrait-two.jpg', 'portrait-one.jpg'] }],
    ['B', { id: 'B', mediaPaths: ['portrait-current.jpg'] }],
    ['C', { id: 'C', mediaPaths: ['scanned-only.jpg', 'portrait-three.jpg'] }],
    ['D', { id: 'D', mediaPaths: ['scanned-only.jpg'] }]
  ];
  const fileNames = [
    'document.jpg', 'portrait-two.jpg', 'portrait-one.jpg', 'portrait-current.jpg',
    'scanned-only.jpg', 'portrait-three.jpg'
  ];
  const setup = `
    const fileNames = ${JSON.stringify(fileNames)};
    const files = Object.fromEntries(fileNames.map((name) => [name, { name, type: 'image/jpeg' }]));
    const people = new Map(${JSON.stringify(people)});
    const entries = fileNames.map((path) => ({ key: path, path, file: files[path] }));
    const state = {
      people,
      mediaTypes: new Map([
        ['document.jpg', 'document'],
        ['portrait-two.jpg', 'portrait'],
        ['portrait-one.jpg', 'portrait'],
        ['portrait-current.jpg', 'portrait'],
        ['scanned-only.jpg', 'unclassified'],
        ['portrait-three.jpg', 'portrait']
      ])
    };
    const current = new Map([
      ['A', { path: 'document.jpg', file: files['document.jpg'] }],
      ['B', { path: 'portrait-current.jpg', file: files['portrait-current.jpg'] }],
      ['C', null],
      ['D', { path: 'scanned-only.jpg', file: files['scanned-only.jpg'] }]
    ]);
    const getMediaLibraryEntries = () => entries;
    const sortedPeople = () => [...people.values()];
    const primaryImageFor = (person) => current.get(person.id);
    const resolveMediaFile = (path) => files[path];
    const isImageFile = () => true;
  `;
  const start = source.indexOf('  function portraitEntriesForPerson');
  const end = source.indexOf('  function openProfileImageReview', start);
  const context = vm.createContext({});
  vm.runInContext(`${setup}\n${source.slice(start, end)}\nglobalThis.result = profileImageCandidates();`, context);
  assert.deepEqual(
    Array.from(context.result, ({ person, entry, path }) => [person.id, path || entry.path]),
    [['A', 'portrait-two.jpg'], ['C', 'portrait-three.jpg']]
  );
});

test('Religious is a life event and recognizes existing Religious EVEN records', () => {
  const { lifeEventConfigFor } = evaluateSource(
    '  const lifeEventTypes = [',
    '\n  const lifeEventFields',
    '{ lifeEventConfigFor }'
  );
  const config = lifeEventConfigFor({ type: 'EVEN', detail: 'Religious' });
  assert.equal(config.label, 'Religious');
  assert.equal(config.tag, 'EVEN');
  assert.equal(config.type, 'Religious');
});

test('Naturalization uses its standard GEDCOM event tag', () => {
  const { lifeEventConfigFor } = evaluateSource(
    '  const lifeEventTypes = [',
    '\n  const lifeEventFields',
    '{ lifeEventConfigFor }'
  );
  const config = lifeEventConfigFor({ type: 'NATU' });
  assert.equal(config.key, 'NATU');
  assert.equal(config.label, 'Naturalization');
  assert.equal(config.tag, 'NATU');
});

test('hero frame renderer makes the square crop fill the underlying photo at 100 percent', () => {
  const { createHeroFrameRenderer, HERO_CROP_SIZE } = evaluateSource(
    '  const HERO_CROP_SIZE',
    '\n  // Bigger editor:',
    '{ createHeroFrameRenderer, HERO_CROP_SIZE }'
  );
  const frame = { file: 'portrait.jpg', x: 0, y: 0, scale: 1 };
  const renderer = createHeroFrameRenderer(frame);
  const hero = { style: {} };
  const helper = { style: {} };
  const scaleOf = (img) => { const parts = String(img.style.transform).split('scale('); return Number(parts[parts.length - 1].replace(')', '')); };
  renderer.paintHero(hero);
  renderer.paintHelper(helper);
  assert.equal(renderer.zoomPercent, 100);
  // Hero and editor show the same full-square crop.
  assert.equal(scaleOf(hero), 1 / HERO_CROP_SIZE);
  assert.equal(scaleOf(helper), 1 / HERO_CROP_SIZE);
  assert.equal(HERO_CROP_SIZE, 1);
  // At 100% the square fills the photo and cannot pan until it is zoomed in.
  renderer.setOffset(1, -1);
  const maxOffset = (1 - HERO_CROP_SIZE) / 2;
  assert.equal(maxOffset, 0);
  assert.ok(Math.abs(frame.x) < 1e-12);
  assert.ok(Math.abs(frame.y) < 1e-12);
  // Zooming in enlarges that travel limit; the photo edge still bounds it.
  renderer.zoomBy(1);
  renderer.setOffset(1, 0);
  assert.equal(renderer.zoomPercent, 105);
  const zoomedMax = (1.05 - HERO_CROP_SIZE) / 2;
  assert.ok(zoomedMax > maxOffset);
  assert.ok(Math.abs(frame.x - zoomedMax) < 1e-12);
  // Zooming out stops at 100%, and reset re-centres the photo.
  renderer.zoomBy(-1);
  renderer.zoomBy(-1);
  assert.equal(renderer.zoomPercent, 100);
  renderer.reset();
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 0);
});
