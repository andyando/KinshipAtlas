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

test('identical files each linked to several people are left alone', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('Ada/group.jpg', 'mm', { personIds: ['I1', 'I2'] }),
    duplicateEntry('Bill/group.jpg', 'mm', { personIds: ['I2', 'I3'] })
  ]);
  // A photo naming several people is shared on purpose: one copy lives in each
  // person's folder, so the copies are not offered for removal.
  assert.equal(groups.length, 0);
});

test('identical files linked to one person are still duplicates', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('Ada/photo.jpg', 'nn', { personIds: ['I1'] }),
    duplicateEntry('Bill/photo.jpg', 'nn', { personIds: ['I2'] })
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].files.length, 2);
});

test('only empty subfolders are reported, apart from the archive folder', () => {
  const unused = core.findUnusedFolders({
    archiveFolder: 'Archive',
    folders: ['Ada Allnutt (1900-unknown) [I1]', 'Old papers', 'Archive', 'Deep/nested'],
    files: [
      { relativePath: 'keep.jpg' },
      { relativePath: 'Ada Allnutt (1900-unknown) [I1]/photo.jpg' },
      { relativePath: 'Old papers/scan.pdf' },
      { relativePath: 'Archive/2020-01-01/old.jpg' }
    ]
  });
  assert.deepEqual(unused.map((entry) => entry.folder), ['deep']);
});

test('a folder with files anywhere inside it is never reported', () => {
  const unused = core.findUnusedFolders({
    archiveFolder: 'Archive',
    folders: ['Misc'],
    files: [{ relativePath: 'Misc/held.jpg' }]
  });
  assert.equal(unused.length, 0);
});

test('stale FILE paths are repointed at the file\'s place in the media folder', () => {
  const text = '0 @I1@ INDI\n1 NAME A /B/\n2 FILE G:\\tree-app\\Primary Media Library\\Ancestry_01112026_media\\Ada Allnutt [I455]\\photo.jpg\n0 TRLR\n';
  const repointed = core.repointGedcomFiles(text, [
    { relativePath: 'Ada Allnutt (1864-unknown) [I455]/photo.jpg' }
  ], { mediaFolderName: 'Ancestry_01112026_media' });
  assert.match(reponed(), /Ada Allnutt \(1864-unknown\) \[I455\]\/photo\.jpg/);
  function reponed() { return repointed; }
});

test('a FILE path naming a shared name is only repointed by exact path', () => {
  const text = '0 @I1@ INDI\n1 NAME A /B/\n2 FILE C:\\old\\Ada\\photo.jpg\n2 FILE C:\\old\\Bill\\photo.jpg\n0 TRLR\n';
  const files = [
    { relativePath: 'Ada/photo.jpg' },
    { relativePath: 'Bill/photo.jpg' }
  ];
  const repointed = core.repointGedcomFiles(text, files, { mediaFolderName: 'media' });
  // Neither old path spells either file's folder, and the name is shared, so
  // nothing is guessed.
  assert.equal(repointed, text);
  // A media folder named "media" in the old path is stripped, leaving "Ada",
  // which matches one file by its folder and name.
  const exact = core.repointGedcomFiles('0 @I1@ INDI\n2 FILE C:\\old\\media\\Ada\\photo.jpg\n0 TRLR\n', files, { mediaFolderName: 'media' });
  assert.match(exact, /Ada\/photo\.jpg/);
  // A bare file name is only repointed when it matches a file's name: here the
  // only file is "Ada/portrait.jpg", so a bare "portrait.jpg" line matches it.
  const bare = core.repointGedcomFiles('0 @I1@ INDI\n2 FILE portrait.jpg\n0 TRLR\n', [{ relativePath: 'Ada/portrait.jpg' }], { mediaFolderName: 'media' });
  assert.match(bare, /Ada\/portrait\.jpg/);
});

test('a FILE path is never repointed at an archived copy', () => {
  const text = '0 @I1@ INDI\n1 NAME A /B/\n2 FILE C:\\old\\Ada\\photo.jpg\n0 TRLR\n';
  const files = [
    { relativePath: 'Archive/2020-01-01/photo.jpg' },
    { relativePath: 'Ada/photo.jpg' }
  ];
  const repointed = core.repointGedcomFiles(text, files, { mediaFolderName: 'media' });
  assert.match(repointed, /Ada\/photo\.jpg/);
  assert.doesNotMatch(repointed, /Archive\//);
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
