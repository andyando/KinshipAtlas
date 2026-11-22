'use strict';
// Duplicate media: exact copies (same bytes) that no card image or life event uses.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const core = require('../helpers/media-organise.js');

// --- Duplicate files -------------------------------------------------------

function duplicateEntry(relativePath, hash, extra = {}) {
  return { relativePath, name: core.mediaFileName(relativePath), size: 10, hash, key: core.normalizeMediaPath(relativePath), ...extra };
}

test('files with the same contents are duplicates, grouped in path order', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('b/one.jpg', 'aa'),
    duplicateEntry('a/two.jpg', 'aa'),
    duplicateEntry('a/two (2).jpg', 'aa'),
    duplicateEntry('unique.jpg', 'bb'),
    duplicateEntry('read-me.txt', 'aa')
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].keeper.relativePath, 'b/one.jpg');
  assert.equal(groups[0].files.length, 3);
  assert.equal(groups[0].others.length, 2);
});

test('a group holding a card image or a life event photo is never offered', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('hero.png', 'cc'),
    duplicateEntry('other/hero-copy.png', 'cc')
  ], { heroKeys: ['hero.png'] });
  assert.equal(groups[0].keeper.relativePath, 'hero.png');
  assert.equal(groups[0].protected, true);

  const events = core.groupDuplicates([
    duplicateEntry('wedding.jpg', 'dd'),
    duplicateEntry('copy/wedding.jpg', 'dd')
  ], { eventKeys: ['copy/wedding.jpg'] });
  // An event photo is kept, and the whole group is left alone.
  assert.equal(events[0].keeper.relativePath, 'copy/wedding.jpg');
  assert.equal(events[0].protected, true);
});

test('a file only linked to people is kept, and the copies can still go', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('a.jpg', 'q'),
    duplicateEntry('b.jpg', 'q', { linked: true })
  ]);
  assert.equal(groups[0].keeper.relativePath, 'b.jpg');
  assert.equal(groups[0].protected, false);
});

test('a different file that only shares a name is not a duplicate', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('one/photo.jpg', '11'),
    duplicateEntry('two/photo.jpg', '22')
  ]);
  assert.equal(groups.length, 0);
});

test('the GEDCOM path is removed for a deleted duplicate', () => {
  const text = '0 @I1@ INDI\n1 NAME A /B/\n2 FILE C:\\m\\copy.jpg\n2 FILE C:\\m\\keep.pdf\n0 TRLR\n';
  const trimmed = core.removeGedcomFileReferences(text, 'C:\\m\\copy.jpg');
  assert.doesNotMatch(trimmed, /copy\.jpg/);
  assert.match(trimmed, /keep\.pdf/);
  assert.equal(core.removeGedcomFileReferences(text, 'C:\\m\\missing.jpg'), text);
});

test('life event media is told apart from a person photo', () => {
  const fsTools = require('../helpers/media-organise-fs.js');
  const records = [
    { xref: 'I1', tag: 'INDI', lines: ['0 @I1@ INDI', '1 NAME A /B/', '2 FILE C:\\m\\portrait.jpg', '1 BIRT', '2 DATE 1900', '2 FILE C:\\m\\birth.jpg', '1 CENS', '2 FILE C:\\m\\census.pdf'] }
  ];
  const keys = fsTools.eventMediaPaths(records);
  assert.deepEqual([...keys].sort(), ['c:/m/birth.jpg', 'c:/m/census.pdf']);
});
