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

test('media classifications are sorted alphabetically by displayed label', () => {
  const options = evaluateSource(
    '  const mediaTypeOptions = [',
    '\n  const mediaTypeStorageKey',
    'mediaTypeOptions'
  );
  const labels = Array.from(options, ([, label]) => label);
  assert.deepEqual(labels, [...labels].sort((left, right) => left.localeCompare(right)));
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
