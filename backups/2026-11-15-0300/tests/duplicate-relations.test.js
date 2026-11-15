'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Extract the duplicate relationship finder helpers straight from app.js so the
// tests exercise the real production logic.
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  // ---------- Duplicate Relationship Finder ----------');
const end = source.indexOf('  function birthCountryHint(place)');
assert.ok(start > 0 && end > start, 'duplicate relationship helpers not found in app.js');

// Mirrors the app's GEDCOM line parser closely enough for link lines:
// leading level digits, then tag, then optional value.
const parseGedcomField = (line) => {
  const match = /^(\d+) (\S+)(?: (.*))?$/.exec(line);
  return match ? { level: Number(match[1]), tag: match[2], value: match[3] || '' } : null;
};
const splitXref = (value) => /^@([^@]+)@$/.test(value) ? value.slice(1, -1) : '';

function buildHarness(gedcomRecords, people, families) {
  const context = vm.createContext({
    state: {
      gedcomRecords, people: new Map(people), families: new Map(families),
      primaryPersonId: ''
    },
    parseGedcomField,
    splitXref,
    reparseGedcomRecords: () => { },
    refreshAfterGedcomMutation: () => { }
  });
  vm.runInContext(`${source.slice(start, end)}\nthis.api = { findDuplicateRelationships, deleteDuplicateRelationship };`, context);
  return context.api;
}

const field = parseGedcomField;
const famRecord = (xref, lines) => ({ xref, tag: 'FAM', lines });
const indiRecord = (xref, lines) => ({ xref, tag: 'INDI', lines });
const person = (id, name) => [id, { id, name }];
const familyEntry = (id, extra = {}) => [id, { id, husbandId: '', wifeId: '', childIds: [], marriage: null, divorce: null, sourceIds: [], ...extra }];

test('finds a child listed twice in the same family and deletes one CHIL line only', () => {
  const record = famRecord('F1', ['0 @F1@ FAM', '1 WIFE @W@', '1 CHIL @A@', '1 CHIL @A@']);
  const api = buildHarness([record], [person('A', 'Kid'), person('W', 'Mother')],
    [familyEntry('F1', { wifeId: 'W', childIds: ['A', 'A'] })]);
  const childDupes = api.findDuplicateRelationships().filter((f) => f.kind === 'child');
  assert.equal(childDupes.length, 1);
  assert.equal(childDupes[0].personId, 'A');
  assert.ok(api.deleteDuplicateRelationship(childDupes));
  assert.equal(record.lines.filter((line) => field(line)?.tag === 'CHIL').length, 1, 'one CHIL line remains');
  assert.ok(record.lines.includes('1 WIFE @W@'), 'spouse link untouched');
});

test('repeated FAMC and FAMS back references are detected', () => {
  const spouse = indiRecord('P', ['0 @P@ INDI', '1 NAME Parent /Test/', '1 FAMS @F1@', '1 FAMS @F1@']);
  const child = indiRecord('C', ['0 @C@ INDI', '1 NAME Child /Test/', '1 FAMC @F1@', '1 FAMC @F1@']);
  const api = buildHarness(
    [famRecord('F1', ['0 @F1@ FAM', '1 HUSB @P@']), spouse, child],
    [person('P', 'Parent Test'), person('C', 'Child Test')],
    [familyEntry('F1', { husbandId: 'P' })]
  );
  const kinds = api.findDuplicateRelationships().map((f) => f.kind).sort().join(',');
  // The repeated FAMC also makes the same parent reachable twice, so the
  // cross-family duplicate check reports it as well.
  assert.equal(kinds, 'famc,famc-duplicate-parent,fams');
  assert.ok(api.deleteDuplicateRelationship(api.findDuplicateRelationships()));
  assert.equal(spouse.lines.filter((line) => field(line)?.tag === 'FAMS').length, 1, 'one FAMS link remains');
  assert.equal(child.lines.filter((line) => field(line)?.tag === 'FAMC').length, 1, 'one FAMC link remains');
});

test('a person recorded as both husband and wife of one family is flagged', () => {
  const api = buildHarness(
    [famRecord('F1', ['0 @F1@ FAM', '1 HUSB @X@', '1 WIFE @X@'])],
    [person('X', 'Solo')],
    [familyEntry('F1', { husbandId: 'X', wifeId: 'X' })]
  );
  const findings = api.findDuplicateRelationships().filter((f) => f.kind === 'self-spouse');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].personId, 'X');
});

test('families with different couples or children are not reported as twins', () => {
  const api = buildHarness(
    [
      famRecord('F1', ['0 @F1@ FAM', '1 WIFE @W@', '1 CHIL @A@', '1 CHIL @A@']),
      famRecord('F2', ['0 @F2@ FAM', '1 HUSB @P@', '1 CHIL @B@'])
    ],
    [person('A', 'Kid'), person('W', 'Mother'), person('P', 'Father'), person('B', 'Other Kid')],
    [
      familyEntry('F1', { wifeId: 'W', childIds: ['A', 'A'] }),
      familyEntry('F2', { husbandId: 'P', childIds: ['B'] })
    ]
  );
  const kinds = api.findDuplicateRelationships().map((f) => f.kind);
  assert.equal(kinds.filter((kind) => kind === 'child').length, 1);
  assert.ok(!kinds.includes('family-copy'), 'families with different couples are not twins');
});

test('a unique link is never removed even if a finding is passed by hand', () => {
  const record = famRecord('F1', ['0 @F1@ FAM', '1 WIFE @W@', '1 CHIL @A@']);
  const api = buildHarness([record], [person('A', 'Kid'), person('W', 'Mother')],
    [familyEntry('F1', { wifeId: 'W', childIds: ['A'] })]);
  const fake = { kind: 'child', recordXref: 'F1', lineIndex: 2, personId: 'A', otherId: 'F1' };
  assert.equal(api.deleteDuplicateRelationship([fake]), false, 'single CHIL line refuses deletion');
  assert.equal(record.lines.filter((line) => field(line)?.tag === 'CHIL').length, 1);
});

test('a redundant twin family is removed together with its back references', () => {
  const spouseP = indiRecord('P', ['0 @P@ INDI', '1 NAME Parent /One/', '1 FAMS @F1@', '1 FAMS @F2@']);
  const spouseQ = indiRecord('Q', ['0 @Q@ INDI', '1 NAME Parent /Two/', '1 FAMS @F1@', '1 FAMS @F2@']);
  const childA = indiRecord('A', ['0 @A@ INDI', '1 NAME Kid /One/', '1 FAMC @F1@', '1 FAMC @F2@']);
  const records = [
    famRecord('F1', ['0 @F1@ FAM', '1 HUSB @P@', '1 WIFE @Q@', '1 CHIL @A@']),
    famRecord('F2', ['0 @F2@ FAM', '1 HUSB @P@', '1 WIFE @Q@', '1 CHIL @A@']),
    spouseP, spouseQ, childA
  ];
  const api = buildHarness(records,
    [person('P', 'Parent One'), person('Q', 'Parent Two'), person('A', 'Kid One')],
    [
      familyEntry('F1', { husbandId: 'P', wifeId: 'Q', childIds: ['A'] }),
      familyEntry('F2', { husbandId: 'P', wifeId: 'Q', childIds: ['A'] })
    ]
  );
  const findings = api.findDuplicateRelationships().filter((f) => f.kind === 'family-copy');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].wholeFamily, 'F2');
  assert.ok(api.deleteDuplicateRelationship(findings));
  assert.ok(records.some((r) => r.tag === 'FAM' && r.xref === 'F1'), 'the first family survives');
  assert.ok(!records.some((r) => r.tag === 'FAM' && r.xref === 'F2'), 'the twin family is removed');
  assert.ok(spouseP.lines.includes('1 FAMS @F1@'), 'spouse keeps the surviving family link');
  assert.ok(!spouseP.lines.includes('1 FAMS @F2@'), 'dangling twin link removed from husband');
  assert.ok(spouseQ.lines.includes('1 FAMS @F1@'), 'wife keeps the surviving family link');
  assert.ok(!spouseQ.lines.includes('1 FAMS @F2@'), 'dangling twin link removed from wife');
  assert.ok(childA.lines.includes('1 FAMC @F1@'), 'child keeps the surviving family link');
  assert.ok(!childA.lines.includes('1 FAMC @F2@'), 'dangling twin link removed from child');
});

// Mirrors the real Ancestry export: Isidor Magnus (@I44@) carries two FAMC
// lines, @F21@ (full family) and @F701@ (father-only stub), both naming the
// same father Julius Alexander Magnus (@I46@).
test('a child linked to the same parent through two family records is reported', () => {
  const child = indiRecord('I44', ['0 @I44@ INDI', '1 NAME Isidor /Magnus/', '1 FAMC @F21@', '1 FAMC @F701@']);
  const api = buildHarness(
    [
      famRecord('F21', ['0 @F21@ FAM', '1 HUSB @I46@', '1 WIFE @I47@', '1 CHIL @I44@']),
      famRecord('F701', ['0 @F701@ FAM', '1 HUSB @I46@', '1 CHIL @I44@']),
      child
    ],
    [person('I44', 'Isidor Magnus'), person('I46', 'Julius Alexander Magnus'), person('I47', 'Mother Magnus')],
    [
      familyEntry('F21', { husbandId: 'I46', wifeId: 'I47', childIds: ['I44'] }),
      familyEntry('F701', { husbandId: 'I46', childIds: ['I44'] })
    ]
  );
  const findings = api.findDuplicateRelationships().filter((f) => f.kind === 'famc-duplicate-parent');
  assert.equal(findings.length, 1, 'one duplicate parent link reported');
  assert.equal(findings[0].personId, 'I44');
  // The fuller family (both parents) is kept; the father-only stub is dropped.
  assert.equal(findings[0].keepFamilyId, 'F21');
  assert.equal(findings[0].otherId, 'F701');
});

test('deleting the duplicate parent link keeps the fuller family and the parent', () => {
  const child = indiRecord('I44', ['0 @I44@ INDI', '1 NAME Isidor /Magnus/', '1 FAMC @F21@', '1 FAMC @F701@']);
  const api = buildHarness(
    [
      famRecord('F21', ['0 @F21@ FAM', '1 HUSB @I46@', '1 WIFE @I47@', '1 CHIL @I44@']),
      famRecord('F701', ['0 @F701@ FAM', '1 HUSB @I46@', '1 CHIL @I44@']),
      child
    ],
    [person('I44', 'Isidor Magnus'), person('I46', 'Julius Alexander Magnus'), person('I47', 'Mother Magnus')],
    [
      familyEntry('F21', { husbandId: 'I46', wifeId: 'I47', childIds: ['I44'] }),
      familyEntry('F701', { husbandId: 'I46', childIds: ['I44'] })
    ]
  );
  const findings = api.findDuplicateRelationships().filter((f) => f.kind === 'famc-duplicate-parent');
  assert.ok(api.deleteDuplicateRelationship(findings));
  assert.ok(child.lines.includes('1 FAMC @F21@'), 'the full family link survives');
  assert.ok(!child.lines.includes('1 FAMC @F701@'), 'the stub family link is removed');
});

test('two different parents through two families is not a duplicate', () => {
  const child = indiRecord('I44', ['0 @I44@ INDI', '1 FAMC @F21@', '1 FAMC @F701@']);
  const api = buildHarness(
    [
      famRecord('F21', ['0 @F21@ FAM', '1 HUSB @I46@', '1 CHIL @I44@']),
      famRecord('F701', ['0 @F701@ FAM', '1 HUSB @I99@', '1 CHIL @I44@']),
      child
    ],
    [person('I44', 'Child'), person('I46', 'Father One'), person('I99', 'Father Two')],
    [
      familyEntry('F21', { husbandId: 'I46', childIds: ['I44'] }),
      familyEntry('F701', { husbandId: 'I99', childIds: ['I44'] })
    ]
  );
  const findings = api.findDuplicateRelationships().filter((f) => f.kind === 'famc-duplicate-parent');
  assert.equal(findings.length, 0, 'adoptive and biological parents are not duplicates');
});
