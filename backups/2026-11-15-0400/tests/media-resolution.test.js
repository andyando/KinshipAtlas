'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const resolverSource = source.slice(source.indexOf('  function normalizeMediaPath('), source.indexOf('  function isImageFile('));

function resolverWith(entries) {
  const byName = new Map();
  const relativePaths = new Map();
  const files = {};
  for (const relativePath of entries) {
    const name = relativePath.split('/').at(-1);
    const file = { name, relativePath };
    files[relativePath] = file;
    relativePaths.set(file, relativePath);
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(file);
  }
  const context = vm.createContext({ state: { mediaIndex: { byName }, mediaRelativePaths: relativePaths } });
  vm.runInContext(resolverSource, context);
  return { resolve: (mediaPath) => context.resolveMediaFile(mediaPath), files };
}

test('a file saved at the media folder root is found despite a same-named file in a subfolder', () => {
  const { resolve, files } = resolverWith(['Smith/photo.jpg', 'photo.jpg']);
  assert.equal(resolve('photo.jpg'), files['photo.jpg']);
});

test('a subfolder path still resolves to the matching subfolder file', () => {
  const { resolve, files } = resolverWith(['Smith/photo.jpg', 'Jones/photo.jpg', 'photo.jpg']);
  assert.equal(resolve('C:/Archive/Jones/photo.jpg'), files['Jones/photo.jpg']);
});

test('a bare name shared only by subfolder files stays ambiguous', () => {
  const { resolve } = resolverWith(['Smith/photo.jpg', 'Jones/photo.jpg']);
  assert.equal(resolve('photo.jpg'), null);
});
