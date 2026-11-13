'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Extract the real parseGedcom from app.js and run it against a GEDCOM that
// omits FAMC/FAMS back references, which is what broke the pedigree view.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  function parseGedcom(text) {');
const end = source.indexOf('  // 6. Kinship graph and relationship terms');
assert.ok(start > 0 && end > start, 'parseGedcom not found in app.js');

const splitXref = (value) => /^@([^@]+)@$/.test(value) ? value.slice(1, -1) : '';
const parseGedcomField = (line) => {
  const match = /^(\d+)\s+([A-Za-z0-9_]+)(?:\s+(.*))?$/.exec(line);
  return match ? { level: Number(match[1]), tag: match[2].toUpperCase(), value: match[3] || '' } : null;
};
const splitGedcomRecords = (text) => {
  const records = [];
  let active = null;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const start = line.match(/^0\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (start) {
      if (active) records.push(active);
      active = { xref: splitXref(start[1]), tag: start[2].toUpperCase(), lines: [line] };
    } else if (active) {
      active.lines.push(line);
    }
  }
  if (active) records.push(active);
  return records;
};

const mediaRecordFiles = (records) => {
  const files = new Map();
  for (const record of records) {
    if (record.tag !== 'OBJE' || !record.xref) continue;
    const paths = record.lines.slice(1).map(parseGedcomField)
      .filter((field) => field?.tag === 'FILE' && field.value.trim())
      .map((field) => field.value.trim());
    if (paths.length) files.set(record.xref, paths);
  }
  return files;
};

const context = vm.createContext({
  eventNames: { BIRT: 'Birth', DEAT: 'Death', MARR: 'Marriage', DIV: 'Divorce' },
  eventTags: new Set(['BIRT', 'DEAT', 'MARR', 'DIV']),
  cleanEventDisplayText: (value) => String(value || '').trim(),
  parseGedcomCoordinate: () => null,
  splitXref,
  parseGedcomField,
  splitGedcomRecords,
  mediaRecordFiles
});
vm.runInContext(`${source.slice(start, end)}\nthis.parseGedcom = parseGedcom;`, context);
const parseGedcom = (text) => context.parseGedcom(text);

// A child recorded only as "1 CHIL" in the FAM record, with no FAMC on the
// person, and a spouse with no FAMS. This mirrors the real Ancestry export.
const GEDCOM = [
  '0 HEAD',
  '0 @I1@ INDI',
  '1 NAME Child /One/',
  '1 SEX M',
  '0 @I2@ INDI',
  '1 NAME Father /One/',
  '1 SEX M',
  '0 @I3@ INDI',
  '1 NAME Mother /One/',
  '1 SEX F',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I3@',
  '1 CHIL @I1@',
  '0 TRLR',
  ''
].join('\n');

test('a child listed only as CHIL in the family record still gets its parent family', () => {
  const parsed = parseGedcom(GEDCOM);
  const child = parsed.people.get('I1');
  assert.deepEqual([...child.parentFamilyIds], ['F1'], 'parent family linked from the FAM record');
});

test('spouses listed only as HUSB/WIFE still get their spouse family', () => {
  const parsed = parseGedcom(GEDCOM);
  assert.deepEqual([...parsed.people.get('I2').spouseFamilyIds], ['F1']);
  assert.deepEqual([...parsed.people.get('I3').spouseFamilyIds], ['F1']);
});

test('explicit FAMC and FAMS lines are not duplicated by the back-link pass', () => {
  const withLinks = [
    '0 HEAD',
    '0 @I1@ INDI',
    '1 NAME Child /One/',
    '1 FAMC @F1@',
    '0 @I2@ INDI',
    '1 NAME Father /One/',
    '1 FAMS @F1@',
    '0 @F1@ FAM',
    '1 HUSB @I2@',
    '1 CHIL @I1@',
    '0 TRLR',
    ''
  ].join('\n');
  const parsed = parseGedcom(withLinks);
  assert.deepEqual([...parsed.people.get('I1').parentFamilyIds], ['F1'], 'no duplicate FAMC');
  assert.deepEqual([...parsed.people.get('I2').spouseFamilyIds], ['F1'], 'no duplicate FAMS');
});

test('a three-generation chain resolves parents at every level', () => {
  const chain = [
    '0 HEAD',
    '0 @I1@ INDI', '1 NAME Grandchild /One/',
    '0 @I2@ INDI', '1 NAME Child /One/',
    '0 @I3@ INDI', '1 NAME Grandparent /One/',
    '0 @F1@ FAM', '1 HUSB @I2@', '1 CHIL @I1@',
    '0 @F2@ FAM', '1 HUSB @I3@', '1 CHIL @I2@',
    '0 TRLR', ''
  ].join('\n');
  const parsed = parseGedcom(chain);
  const parentsOf = (id) => {
    const person = parsed.people.get(id);
    const ids = new Set();
    for (const familyId of person.parentFamilyIds) {
      const family = parsed.families.get(familyId);
      if (!family) continue;
      for (const parentId of [family.husbandId, family.wifeId]) {
        if (parentId && parentId !== id && parsed.people.has(parentId)) ids.add(parentId);
      }
    }
    return [...ids];
  };
  assert.deepEqual(parentsOf('I1'), ['I2'], 'child sees its parent');
  assert.deepEqual(parentsOf('I2'), ['I3'], 'parent sees the grandparent');
});
