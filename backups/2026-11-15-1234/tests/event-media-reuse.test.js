'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness() {
  const pending = { personId: 'I1', existingMedia: ['birth.jpg'], linkedMedia: [], newMedia: [] };
  const context = vm.createContext({
    state: { pendingLifeEvent: pending, people: new Map([['I1', {
      events: [{ mediaPaths: ['birth.jpg', 'shared.pdf'] }, { mediaPaths: ['shared.pdf'] }]
    }]]) },
    mediaPathsForPerson: () => ['portrait.jpg', 'birth.jpg', 'shared.pdf'],
    lifeEventFields: () => ({}),
    lifeEventBlockEnd: (lines, start) => {
      let end = start + 1;
      while (end < lines.length && !/^1 /.test(lines[end])) end++;
      return end;
    }
  });
  for (const [startName, endName] of [
    ['  function availableLifeEventMedia(', '  function renderLifeEventMedia('],
    ['  async function uploadLifeEventMedia(', '  let pendingEventMediaDelete'],
    ['  function eventMediaLines(', '  function mediaLinkedText(']
  ]) {
    vm.runInContext(source.slice(source.indexOf(startName), source.indexOf(endName)), context);
  }
  return { context, pending };
}

test('attached media includes other events, deduplicates paths and excludes only current selections', () => {
  const { context, pending } = harness();
  assert.deepEqual(Array.from(context.availableLifeEventMedia(pending)), ['portrait.jpg', 'shared.pdf']);
  pending.linkedMedia.push('shared.pdf');
  assert.deepEqual(Array.from(context.availableLifeEventMedia(pending)), ['portrait.jpg']);
});

test('reusing a file needs no folder write access and remains available to other events', async () => {
  const { context, pending } = harness();
  pending.linkedMedia.push('shared.pdf');
  assert.deepEqual(Array.from(await context.uploadLifeEventMedia()), ['shared.pdf']);
  assert.deepEqual(Array.from(context.eventMediaLines(['shared.pdf'])), ['2 OBJE', '3 FILE shared.pdf', '4 FORM pdf']);
  const anotherEvent = { personId: 'I1', existingMedia: [], linkedMedia: [] };
  assert.ok(context.availableLifeEventMedia(anotherEvent).includes('shared.pdf'));
});
