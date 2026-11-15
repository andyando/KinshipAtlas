'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const selectionSource = source.slice(source.indexOf('  function loadPrimaryMedia('), source.indexOf('  function addFileToMediaIndex('));
const oldKey = `kinship-atlas:primary-media:v1:${'a'.repeat(64)}`;
const newKey = `kinship-atlas:primary-media:v1:${'b'.repeat(64)}`;
const typeKey = (key) => `kinship-atlas:media-types:v1:${key}`;

function harness({ saved = {}, local = {}, quota = Infinity, loadStatus = 200, saveStatus = 200 } = {}) {
  const data = new Map(Object.entries(local).map(([key, value]) => [key, JSON.stringify(value)]));
  const posts = [];
  const messages = [];
  let writes = 0;
  const storage = {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index]; },
    getItem(key) { return data.get(key) ?? null; },
    removeItem(key) { data.delete(key); },
    setItem(key, value) {
      writes += 1;
      const next = new Map(data).set(key, value);
      if ([...next].reduce((size, [k, v]) => size + k.length + v.length, 0) > quota) throw new Error('QuotaExceededError');
      data.set(key, value);
    }
  };
  const context = vm.createContext({
    state: {
      mediaHelper: {}, primaryMediaKey: oldKey,
      primaryMedia: new Map([['I1', 'portrait.jpg']]),
      additionalMedia: new Map([['I1', ['document.pdf']]]),
      mediaTypes: new Map([['document.pdf', 'census']])
    },
    localStorage: storage,
    location: { protocol: 'http:' },
    console: { warn() {}, error() {} },
    showToast: (message) => messages.push(message),
    mediaPathsForPerson: () => ['portrait.jpg', 'new.jpg'],
    fetch: async (url, options) => {
      if (url === '/kinship-selections.json') return {
        ok: loadStatus === 200, status: loadStatus,
        json: async () => ({ selections: saved })
      };
      assert.equal(url, '/api/selections');
      posts.push(JSON.parse(options.body));
      return { ok: saveStatus === 200, status: saveStatus };
    }
  });
  vm.runInContext(selectionSource, context);
  return { context, data, posts, messages, writes: () => writes };
}

test('helper preferences load without writing historical entries into full browser storage', async () => {
  const h = harness({
    saved: { [oldKey]: { I1: 'portrait.jpg' }, [typeKey(oldKey)]: { 'document.pdf': 'census' } },
    quota: 0
  });
  await h.context.loadHelperSelections();
  assert.equal(h.writes(), 0);
  assert.equal(h.context.loadPrimaryMedia(oldKey, new Map([['I1', {}]])).get('I1'), 'portrait.jpg');
  assert.equal(h.context.loadMediaTypes(oldKey).get('document.pdf'), 'census');
  assert.equal(h.context.storeSelection(typeKey(oldKey), { 'document.pdf': 'birth' }), true);
  assert.equal(await h.context.syncSelectionsToHelper(), true);
  assert.equal(h.posts.at(-1).selections[typeKey(oldKey)]['document.pdf'], 'birth');
});

test('browser choices override matching file entries without dropping other saved choices', async () => {
  const h = harness({
    saved: { [oldKey]: { I1: 'portrait.jpg', I2: 'other.jpg' } },
    local: { [oldKey]: { I1: 'new.jpg' } }
  });
  await h.context.loadHelperSelections();
  const result = h.context.readSelection(oldKey);
  assert.equal(result.I1, 'new.jpg');
  assert.equal(result.I2, 'other.jpg');
  assert.equal(h.writes(), 0);
});

test('a quota failure cannot make stale browser values override the latest file-backed choice', async () => {
  const h = harness({
    saved: { [oldKey]: { I1: 'portrait.jpg' } },
    local: { [oldKey]: { I1: 'portrait.jpg' } },
    quota: 0
  });
  await h.context.loadHelperSelections();
  h.context.readSelection(oldKey);
  h.context.storeSelection(oldKey, { I1: 'new.jpg' });
  assert.equal(h.context.readSelection(oldKey).I1, 'new.jpg');
  await h.context.syncSelectionsToHelper();
  assert.equal(h.posts.at(-1).selections[oldKey].I1, 'new.jpg');
});

test('new helper file starts from browser preferences', async () => {
  const h = harness({ loadStatus: 404, local: { [oldKey]: { I1: 'portrait.jpg' } } });
  await h.context.loadHelperSelections();
  h.context.readSelection(oldKey);
  assert.equal(await h.context.syncSelectionsToHelper(), true);
  assert.equal(h.posts[0].selections[oldKey].I1, 'portrait.jpg');
});

test('opening a tree does not reimport obsolete browser snapshots', async () => {
  const h = harness({
    saved: { [newKey]: { I1: 'new.jpg' } },
    local: { [oldKey]: { I1: 'portrait.jpg' } }
  });
  await h.context.loadHelperSelections();
  h.context.readSelection(newKey);
  await h.context.syncSelectionsToHelper();
  assert.equal(h.posts[0].selections[oldKey], undefined);
  assert.equal(h.posts[0].selections[newKey].I1, 'new.jpg');
});

test('a failed selections load cannot overwrite the saved file', async () => {
  const h = harness({ loadStatus: 500 });
  await h.context.loadHelperSelections();
  h.context.storeSelection(oldKey, { I1: 'new.jpg' });
  await h.context.syncSelectionsToHelper();
  assert.equal(h.posts.length, 0);
  assert.match(h.messages[0], /will not be overwritten/);
});

test('a malformed selections file cannot be overwritten', async () => {
  const h = harness({ saved: [] });
  await h.context.loadHelperSelections();
  await h.context.syncSelectionsToHelper();
  assert.equal(h.posts.length, 0);
  assert.match(h.messages[0], /will not be overwritten/);
});

test('helper HTTP save failures are reported and block successful exit flushing', async () => {
  const h = harness({ saveStatus: 413 });
  await h.context.loadHelperSelections();
  assert.equal(await h.context.syncSelectionsToHelper(), false);
  assert.match(h.messages[0], /could not be saved/);
});

test('queued saves finish in order with the latest selection retained', async () => {
  const h = harness();
  await h.context.loadHelperSelections();
  h.context.storeSelection(oldKey, { I1: 'portrait.jpg' });
  h.context.storeSelection(oldKey, { I1: 'new.jpg' });
  await h.context.syncSelectionsToHelper();
  assert.equal(h.posts.at(-1).selections[oldKey].I1, 'new.jpg');
});

test('GEDCOM revisions move all preference types without accumulating old snapshots', async () => {
  const h = harness({
    saved: {
      [oldKey]: { I1: 'portrait.jpg' },
      [`${oldKey}:additional-media:v1`]: { I1: ['document.pdf'] },
      [typeKey(oldKey)]: { 'document.pdf': 'census' },
      'kinship-atlas:primary-person:v1:another-tree.ged': { id: 'I99' }
    },
    quota: 0
  });
  await h.context.loadHelperSelections();
  assert.equal(h.context.moveMediaSelections(newKey), true);
  assert.equal(h.context.state.primaryMediaKey, newKey);
  await h.context.syncSelectionsToHelper();
  const selections = h.posts.at(-1).selections;
  assert.equal(Object.keys(selections).length, 4);
  assert.equal(selections['kinship-atlas:primary-person:v1:another-tree.ged'].id, 'I99');
  assert.equal(selections[newKey].I1, 'portrait.jpg');
  assert.deepEqual(selections[`${newKey}:additional-media:v1`].I1, ['document.pdf']);
  assert.equal(selections[typeKey(newKey)]['document.pdf'], 'census');
  assert.equal(selections[oldKey], undefined);
  const thirdKey = `kinship-atlas:primary-media:v1:${'c'.repeat(64)}`;
  assert.equal(h.context.moveMediaSelections(thirdKey), true);
  await h.context.syncSelectionsToHelper();
  assert.equal(Object.keys(h.posts.at(-1).selections).length, 4);
});

test('browser-only migration frees the old snapshot before writing the new one', () => {
  const local = {
    [oldKey]: { I1: 'portrait.jpg' },
    [`${oldKey}:additional-media:v1`]: { I1: ['document.pdf'] },
    [typeKey(oldKey)]: { 'document.pdf': 'census' }
  };
  const quota = Object.entries(local).reduce((size, [key, value]) => size + key.length + JSON.stringify(value).length, 0);
  const h = harness({ local, quota });
  h.context.state.mediaHelper = null;
  assert.equal(h.context.moveMediaSelections(newKey), true);
  assert.equal(h.data.has(oldKey), false);
  assert.equal(h.data.has(typeKey(newKey)), true);
});

test('failed browser-only migration restores old values and keeps their key active', () => {
  const h = harness({ local: { [oldKey]: { I1: 'portrait.jpg' } }, quota: 200 });
  h.context.state.mediaHelper = null;
  assert.equal(h.context.moveMediaSelections(newKey), false);
  assert.equal(h.context.state.primaryMediaKey, oldKey);
  assert.equal(JSON.parse(h.data.get(oldKey)).I1, 'portrait.jpg');
  assert.equal(h.data.has(newKey), false);
  assert.match(h.messages[0], /browser storage is full/);
});

test('clearing a primary person is persisted as an explicit cleared value', async () => {
  const key = 'kinship-atlas:primary-person:v1:synthetic.ged';
  const h = harness({ saved: { [key]: { id: 'I1' } }, quota: 0 });
  await h.context.loadHelperSelections();
  h.context.storeSelection(key, null);
  await h.context.syncSelectionsToHelper();
  assert.equal(h.posts.at(-1).selections[key], null);
});
