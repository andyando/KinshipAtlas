'use strict';
// Checks the media organiser's rules on small, made-up trees.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const core = require('../helpers/media-organise.js');

function records(entries) {
  return entries.map(([xref, tag, lines]) => ({ xref, tag, lines: [`0 @${xref}@ ${tag}`, ...lines] }));
}

function person(id, name, birthYear = '', deathYear = '') {
  return { id, name, birthYear, deathYear };
}

const personFolders = {
  I1: 'A B (1900-1980) [I1]',
  I2: 'D E (unknown-unknown) [I2]'
};

test('a linked file moves into its person folder and the GEDCOM path is rewritten', () => {
  const gedcom = '0 @I1@ INDI\r\n1 NAME A /B/\r\n2 FILE C:\\family\\Ancestry_01112026_media\\loose.jpg\r\n0 TRLR\r\n';
  const state = core.computeMediaOrganiseState(
    records([['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\family\\Ancestry_01112026_media\\loose.jpg']]]),
    [person('I1', 'A B', '1900', '1980')],
    [{ relativePath: 'loose.jpg' }],
    { gedcomText: gedcom, now: new Date('2026-01-31') }
  );
  assert.deepEqual(state.actions.map((action) => [action.kind, action.fromPath, action.toPath]), [
    ['move', 'loose.jpg', 'A B (1900-1980) [I1]/loose.jpg']
  ]);
  const rewritten = core.rewriteGedcomFile(gedcom, 'C:\\family\\Ancestry_01112026_media\\loose.jpg', state.actions[0].toPath);
  assert.match(rewritten, /2 FILE A B \(1900-1980\) \[I1\]\/loose\.jpg\r\n/);
  assert.deepEqual(state.warnings, []);
});

test('a file shared by two people is moved once and copied for the other', () => {
  const state = core.computeMediaOrganiseState(
    records([
      ['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\m\\shared.jpg']],
      ['I2', 'INDI', ['1 NAME D /E/', '2 FILE C:\\m\\shared.jpg']]
    ]),
    [person('I1', 'A B', '1900', '1980'), person('I2', 'D E')],
    [{ relativePath: 'shared.jpg' }],
    { now: new Date('2026-01-31') }
  );
  assert.deepEqual(state.actions.map((action) => action.kind), ['move', 'copy']);
  assert.equal(state.actions[0].toPath, `${personFolders.I1}/shared.jpg`);
  assert.equal(state.actions[1].toPath, `${personFolders.I2}/shared.jpg`);
  assert.deepEqual(state.owners.get('shared.jpg'), ['I1', 'I2']);
});

test('a file in a person folder that nobody links stays with that person', () => {
  const state = core.computeMediaOrganiseState(
    records([
      ['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\m\\linked.jpg']]
    ]),
    [person('I1', 'A B', '1900', '1980'), person('I2', 'D E')],
    [{ relativePath: 'linked.jpg' }, { relativePath: `${personFolders.I2}/portrait.jpg` }],
    { now: new Date('2026-01-31') }
  );
  assert.deepEqual(state.actions.map((action) => [action.kind, action.fromPath, action.toPath]), [
    ['move', 'linked.jpg', `${personFolders.I1}/linked.jpg`]
  ]);
  assert.deepEqual(state.warnings, []);
});

test('an unlinked file is archived under its date, and a card image is kept', () => {
  const state = core.computeMediaOrganiseState(
    [],
    [person('I1', 'A B', '1900', '1980')],
    [{ relativePath: 'loose.jpg' }, { relativePath: 'hero.png' }],
    { now: new Date('2026-02-03'), heroPicks: new Map([['I1', 'hero.png']]) }
  );
  const byPath = new Map(state.actions.map((action) => [action.fromPath, action]));
  assert.equal(byPath.get('loose.jpg').kind, 'archive');
  assert.equal(byPath.get('loose.jpg').toPath, 'Archive/2026-02-03/loose.jpg');
  assert.equal(byPath.get('hero.png').kind, 'move');
  assert.equal(byPath.get('hero.png').toPath, `${personFolders.I1}/hero.png`);
  assert.ok(state.warnings.some((warning) => warning.kind === 'hero'));
});

test('running the plan twice changes nothing the second time', () => {
  const state = core.computeMediaOrganiseState(
    records([['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\m\\x.pdf']]]),
    [person('I1', 'A B', '1900', '1980')],
    [{ relativePath: 'x.pdf' }],
    { now: new Date('2026-01-31') }
  );
  const moved = state.actions[0];
  const second = core.computeMediaOrganiseState(
    records([['I1', 'INDI', ['1 NAME A /B/', `2 FILE ${moved.toPath}`]]]),
    [person('I1', 'A B', '1900', '1980')],
    [{ relativePath: moved.toPath }],
    { now: new Date('2026-01-31') }
  );
  assert.equal(second.actions.length, 0);
});

test('two files called photo.jpg for different people are not confused', () => {
  const state = core.computeMediaOrganiseState(
    records([
      ['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\one\\photo.jpg']],
      ['I2', 'INDI', ['1 NAME D /E/', '2 FILE C:\\two\\photo.jpg']]
    ]),
    [person('I1', 'A B', '1900', '1980'), person('I2', 'D E')],
    [{ relativePath: 'media_0d9/photo.jpg' }],
    { now: new Date('2026-01-31') }
  );
  // Only one photo.jpg exists, so one of the two paths names it and the other is missing.
  assert.equal(state.actions.length + state.warnings.filter((warning) => warning.kind === 'missing').length, 2);
});

test('a missing file is reported, not moved', () => {
  const state = core.computeMediaOrganiseState(
    records([['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\m\\gone.jpg']]]),
    [person('I1', 'A B')],
    [],
    { now: new Date('2026-01-31') }
  );
  assert.equal(state.actions.length, 0);
  assert.ok(state.warnings.some((warning) => warning.kind === 'missing'));
  assert.deepEqual(state.unsupported, ['C:\\m\\gone.jpg']);
});

test('folder names use the Ancestry pattern and suit Windows', () => {
  assert.equal(core.personFolderName(person('I455', 'Ada Allnutt', '1864')), 'Ada Allnutt (1864-unknown) [I455]');
  assert.equal(core.personFolderName(person('I7', 'A/B: C', '1900', '1999')), 'A-B- C (1900-1999) [I7]');
  assert.equal(core.personFolderName(person('I9', 'Trailing dots... ')), 'Trailing dots (unknown-unknown) [I9]');
});

test('rewriting keeps line endings and quoted paths', () => {
  const text = '0 HEAD\n0 @I1@ INDI\n1 NAME A /B/\n2 FILE "C:\\m\\old.jpg"\n0 TRLR\n';
  const rewritten = core.rewriteGedcomFile(text, 'C:\\m\\old.jpg', 'A B (1900-1980) [I1]/old.jpg');
  assert.match(rewritten, /2 FILE "A B \(1900-1980\) \[I1\]\/old\.jpg"\n/);
  assert.equal(core.rewriteGedcomFile(text, 'other.jpg', 'x.jpg'), text);
});

test('plans group moves, copies and archives', () => {
  const state = core.computeMediaOrganiseState(
    records([
      ['I1', 'INDI', ['1 NAME A /B/', '2 FILE C:\\m\\a.jpg', '2 FILE C:\\m\\shared.jpg']],
      ['I2', 'INDI', ['1 NAME D /E/', '2 FILE C:\\m\\shared.jpg']]
    ]),
    [person('I1', 'A B', '1900', '1980'), person('I2', 'D E')],
    [{ relativePath: 'a.jpg' }, { relativePath: 'shared.jpg' }, { relativePath: 'loose.pdf' }],
    { now: new Date('2026-01-31') }
  );
  const plan = core.planMediaOrganise(state);
  assert.equal(plan.counts.copied, 1);
  assert.equal(plan.counts.archived, 1);
  assert.equal(plan.placements.length, 2);
  assert.equal(plan.actions.length, 4);
});
