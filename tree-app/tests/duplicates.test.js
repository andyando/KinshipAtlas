'use strict';
// Duplicate media: exact copies (same bytes) that no card image or life event uses.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const core = require('../helpers/media-organise.js');

// --- Duplicate files -------------------------------------------------------

function duplicateEntry(relativePath, hash, extra = {}) {
  return { relativePath, name: core.mediaFileName(relativePath), size: 10, hash, key: core.normalizeMediaPath(relativePath), ...extra };
}

test('files with the same contents in one folder are duplicates, grouped in path order', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('a/one.jpg', 'aa'),
    duplicateEntry('a/two.jpg', 'aa'),
    duplicateEntry('a/two (2).jpg', 'aa'),
    duplicateEntry('unique.jpg', 'bb'),
    duplicateEntry('read-me.txt', 'aa')
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].keeper.relativePath, 'a/one.jpg');
  assert.equal(groups[0].files.length, 3);
  assert.equal(groups[0].others.length, 2);
  assert.equal(groups[0].folder, 'a');
});

test('a group holding a card image or a life event photo is never offered', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('photos/hero.png', 'cc'),
    duplicateEntry('photos/hero-copy.png', 'cc')
  ], { heroKeys: ['photos/hero.png'] });
  assert.equal(groups[0].keeper.relativePath, 'photos/hero.png');
  assert.equal(groups[0].protected, true);

  const events = core.groupDuplicates([
    duplicateEntry('photos/wedding.jpg', 'dd'),
    duplicateEntry('photos/wedding-copy.jpg', 'dd')
  ], { eventKeys: ['photos/wedding-copy.jpg'] });
  // An event photo is kept, and the whole group is left alone.
  assert.equal(events[0].keeper.relativePath, 'photos/wedding-copy.jpg');
  assert.equal(events[0].protected, true);
});

test('a file only linked to people is kept, and the copies can still go', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('photos/a.jpg', 'q'),
    duplicateEntry('photos/b.jpg', 'q', { linked: true })
  ]);
  assert.equal(groups[0].keeper.relativePath, 'photos/b.jpg');
  assert.equal(groups[0].protected, false);
});

test('identical files in different people\'s folders are left alone', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('Ada/photo.jpg', 'nn', { personIds: ['I1'] }),
    duplicateEntry('Bill/photo.jpg', 'nn', { personIds: ['I2'] })
  ]);
  // One photo can legitimately belong to several people, so a copy in each
  // person's folder is never offered for removal.
  assert.equal(groups.length, 0);
});

test('identical files linked to several people in one folder are still duplicates', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('Ada/group.jpg', 'mm', { personIds: ['I1', 'I2'] }),
    duplicateEntry('Ada/group (2).jpg', 'mm', { personIds: ['I1', 'I2'] })
  ]);
  // Both copies sit in the same person's folder: one is an extra copy.
  assert.equal(groups.length, 1);
  assert.equal(groups[0].files.length, 2);
  assert.equal(groups[0].folder, 'Ada');
});

test('duplicates are grouped within the media folder root and the archive folder', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('loose.jpg', 'root'),
    duplicateEntry('loose copy.jpg', 'root'),
    duplicateEntry('Archive/2020-01-01/old.jpg', 'arc'),
    duplicateEntry('Archive/2020-01-01/old copy.jpg', 'arc'),
    // Same bytes again, but in a different folder each: not a duplicate.
    duplicateEntry('Archive/keep/arc.jpg', 'arc')
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.files.length), [2, 2]);
  assert.deepEqual(groups.map((group) => group.folder).sort(), ['', 'Archive/2020-01-01']);
});

test('one photo shared by two people but copied twice into one folder is a duplicate', () => {
  const groups = core.groupDuplicates([
    duplicateEntry('Ada/shared.jpg', 'sh', { personIds: ['I1', 'I2'] }),
    duplicateEntry('Ada/shared copy.jpg', 'sh', { personIds: ['I1', 'I2'] }),
    duplicateEntry('Bill/shared.jpg', 'sh', { personIds: ['I1', 'I2'] })
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].files.map((file) => file.relativePath), ['Ada/shared copy.jpg', 'Ada/shared.jpg']);
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

// --- Folder-scoped duplicates through the real file helper ------------------

test('the file helper only reports copies inside one folder, including the root and archive', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const fsTools = require('../helpers/media-organise-fs.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ka-dup-'));
  const write = (relative, bytes) => {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes);
  };
  // One person's folder holds the same bytes twice: a duplicate.
  write('Ada Smith (1900-unknown) [I1]/photo.jpg', 'same-bytes');
  write('Ada Smith (1900-unknown) [I1]/photo copy.jpg', 'same-bytes');
  // The same bytes in another person's folder: a legitimate share, not reported.
  write('Bill Jones (1901-unknown) [I2]/photo.jpg', 'same-bytes');
  // The media folder root holds two copies: a duplicate.
  write('loose.jpg', 'root-bytes');
  write('loose copy.jpg', 'root-bytes');
  // The archive folder holds two copies: a duplicate.
  write('Archive/2020-01-01/old.jpg', 'arch-bytes');
  write('Archive/2020-01-01/old copy.jpg', 'arch-bytes');

  const result = await fsTools.findDuplicates(dir, { people: [], records: [], heroPicks: {} });
  const reported = result.groups.map((group) => group.files.map((file) => file.relativePath).sort());
  assert.deepEqual(reported.sort(), [
    ['Archive/2020-01-01/old copy.jpg', 'Archive/2020-01-01/old.jpg'],
    ['Ada Smith (1900-unknown) [I1]/photo copy.jpg', 'Ada Smith (1900-unknown) [I1]/photo.jpg'],
    ['loose copy.jpg', 'loose.jpg']
  ].sort());
  // The shared photo in the second person's folder never appears.
  assert.ok(!reported.flat().some((file) => file.startsWith('Bill Jones')));
  fs.rmSync(dir, { recursive: true, force: true });
});
