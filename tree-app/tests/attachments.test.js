'use strict';
// Attachment support: one type list for the whole app, every supported type
// indexed and validated the same way, and the GEDCOM's own file still ignored.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const core = require('../helpers/media-organise.js');
const fsTools = require('../helpers/media-organise-fs.js');

const appDir = path.join(__dirname, '..');
const tablePath = path.join(appDir, 'data', 'attachment-types.json');
const table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
const configSource = fs.readFileSync(path.join(appDir, 'src', 'modules', '00b-attachment-types.js'), 'utf8');

test('the app and the shared JSON list exactly the same attachment types', () => {
  const images = [...configSource.match(/images: Object\.freeze\(\[([^\]]+)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const documents = [...configSource.match(/documents: Object\.freeze\(\[([^\]]+)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(images, table.images);
  assert.deepEqual(documents, table.documents);
  assert.deepEqual(table.images, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff']);
  assert.deepEqual(table.documents, ['pdf', 'txt', 'doc', 'docx', 'rtf', 'html', 'htm']);
});

test('the organiser accepts every listed attachment type and nothing else', () => {
  for (const extension of [...table.images, ...table.documents]) {
    assert.equal(core.isMediaFile(`someone.${extension}`), true, extension);
    assert.equal(core.isMediaFile(`someone.${extension.toUpperCase()}`), true, `${extension} upper case`);
  }
  for (const extension of ['exe', 'zip', 'ged', 'gedcom', '']) {
    assert.equal(core.isMediaFile(`someone.${extension}`), false, extension || 'no extension');
  }
});

test('a document FILE line is an attachment, while the GEDCOM file itself is not', () => {
  assert.equal(core.isGedcomFileReference('C:\\Old\\Biography.html'), false);
  assert.equal(core.isGedcomFileReference('Alfred Pasley Bell.txt'), false);
  assert.equal(core.isGedcomFileReference('1906 teacher ID.doc'), false);
  assert.equal(core.isGedcomFileReference('C:\\tree\\family.ged'), true);
  assert.equal(core.isGedcomFileReference('Family).gedcom'), true);
});

test('a scanned folder indexes documents beside images, and finds a referenced .txt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ka-attach-'));
  const write = (relative, bytes) => {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes);
  };
  write('Ada Allnutt (1900-unknown) [I1]/portrait.jpg', 'image-bytes');
  write('Ada Allnutt (1900-unknown) [I1]/biography.html', '<p>Ada</p>');
  write('Alfred Pasley Bell.txt', 'Alfred Pasley Bell worked at the school.');
  write('1906 teacher ID.doc', 'doc-bytes');
  write('David Dee Death notice.htm', '<p>Died</p>');
  write('notes.md', 'not supported');

  const records = [
    { tag: 'INDI', xref: 'I1', lines: ['0 @I1@ INDI', '1 NAME Ada /Allnutt/', '1 OBJE', '2 FILE Ada Allnutt (1900-unknown) [I1]/biography.html'] }
  ];
  const plan = core.computeMediaOrganiseState(records, [{ id: 'I1', name: 'Ada Allnutt', birthYear: '1900', deathYear: 'unknown' }],
    fsTools.listMediaFiles(dir), { mediaFolderName: 'media' });
  // The HTML document is recognised as an attachment, not mistaken for the
  // GEDCOM itself: it is never reported as a file the organiser will not touch.
  assert.ok(!plan.warnings.some((warning) => /biography\.html/i.test(warning.path || warning.message || '')),
    'the .html attachment must not be reported as unrecognised');
  // A loose document moves into the person's folder once it is linked.
  records.push({ tag: 'INDI', xref: 'I2', lines: ['0 @I2@ INDI', '1 NAME Alfred /Bell/', '1 OBJE', '2 FILE Alfred Pasley Bell.txt'] });
  const withLoose = core.computeMediaOrganiseState(records, [
    { id: 'I1', name: 'Ada Allnutt', birthYear: '1900', deathYear: 'unknown' },
    { id: 'I2', name: 'Alfred Pasley Bell', birthYear: 'unknown', deathYear: 'unknown' }
  ], fsTools.listMediaFiles(dir), { mediaFolderName: 'media' });
  const moved = withLoose.actions.find((action) => /alfred pasley bell\.txt$/i.test(action.fromPath || ''));
  assert.ok(moved, 'the loose .txt should be placed in its person\'s folder');
  assert.match(moved.toFolder, /alfred pasley bell/i);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('every supported document extension is found by the folder listing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ka-list-'));
  for (const extension of table.documents) fs.writeFileSync(path.join(dir, `file.${extension}`), 'x');
  fs.writeFileSync(path.join(dir, 'ignore.zip'), 'x');
  const listed = fsTools.listMediaFiles(dir).map((file) => core.mediaFileName(file.relativePath)).sort();
  assert.deepEqual(listed, table.documents.map((extension) => `file.${extension}`).sort());
  fs.rmSync(dir, { recursive: true, force: true });
});
