'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function harness() {
  const nodes = new Map();
  function node(tag = 'div') {
    let value = '';
    return {
      tag, children: [], dataset: {}, hidden: false,
      get value() { return value; },
      set value(next) { value = next; },
      append(...children) {
        this.children.push(...children);
        if (tag === 'select' && children.length && this.children.length === children.length) value = children[0].value;
      },
      replaceChildren(...children) { this.children = []; value = ''; this.append(...children); },
      closest() { return this; },
      querySelectorAll() { return []; },
      setAttribute(name, next) { this[name] = next; },
      focus() {}
    };
  }
  const field = (id) => {
    if (!nodes.has(id)) nodes.set(id, node(id === 'relativeFamily' ? 'select' : 'input'));
    return nodes.get(id);
  };
  const people = new Map(['A', 'C', 'D', 'B'].map((id) => [id, {
    id, name: `Example ${id}`, sex: '', events: [], parentFamilyIds: id === 'A' ? ['F1', 'F2'] : [],
    spouseFamilyIds: []
  }]));
  const state = {
    selectedId: 'A', people,
    families: new Map([
      ['F1', { id: 'F1', husbandId: 'C', wifeId: '', childIds: ['A', 'D'] }],
      ['F2', { id: 'F2', husbandId: 'B', wifeId: '', childIds: ['A'] }]
    ]),
    gedcomRecords: [
      ...[...people.keys()].map((id) => ({
        xref: id, tag: 'INDI',
        lines: [`0 @${id}@ INDI`, `1 NAME Example /${id}/`, ...(id === 'A' ? ['1 FAMC @F1@', '1 FAMC @F2@'] : [])]
      })),
      { xref: 'F1', tag: 'FAM', lines: ['0 @F1@ FAM', '1 HUSB @C@', '1 CHIL @A@', '1 CHIL @D@'] },
      { xref: 'F2', tag: 'FAM', lines: ['0 @F2@ FAM', '1 HUSB @B@', '1 CHIL @A@'] }
    ]
  };
  let opened = 0;
  let refreshedId = '';
  const elements = {
    relativeType: field('relativeType'),
    relativeParentRole: field('relativeParentRole'),
    relativeParentRoleField: field('relativeParentRoleField'),
    addRelativeForm: {
      reset() {
        for (const entry of nodes.values()) entry.value = '';
        field('relativeType').value = 'PARENT';
        field('relativeParentRole').value = 'HUSB';
        field('relativeMode').value = 'NEW';
      }
    },
    addRelativeDialog: { showModal() { opened++; }, close() {} }
  };
  const context = vm.createContext({
    state, elements,
    document: { querySelector: (selector) => field(selector.slice(1)), getElementById: field, createElement: node },
    makeButton: (label, className) => Object.assign(node('button'), { textContent: label, className }),
    personName: (id) => people.get(id)?.name,
    partnersOf: () => [],
    syncExistingRelativeChoices() {},
    cleanGedcomValue: (value) => value.trim(),
    enteredGedcomDate: (value) => value,
    nextGedcomXref: (prefix) => `${prefix}NEW`,
    appendRecordLine: (record, line) => { if (!record.lines.includes(line)) record.lines.push(line); },
    addRecordBeforeTrailer: (record) => state.gedcomRecords.push(record),
    refreshAfterGedcomMutation: (id) => { refreshedId = id; }
  });
  function load(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), context);
  }
  load('  const relationGroupTypes =', '\n  function relationshipGroups(');
  load('  function relationshipGroups(', '\n  function ');
  load('  function openRelativeEditor(', '\n  function linkExistingRelative(');
  load('  function linkExistingRelative(', '\n  const relationshipSentences =');
  elements.addRelativeForm.reset();
  return { context, state, field, node, opened: () => opened, refreshedId: () => refreshedId };
}

test('missing-parent buttons carry the correct family and vacant role', () => {
  const h = harness();
  const parents = h.context.relationshipGroups(h.state.people.get('A'))[0][1];
  const root = h.node();
  h.context.addRelationGroup(root, 'Parents', parents);
  const buttons = root.children[0].children[1].children.filter((entry) => entry.dataset.addRelation);
  assert.equal(buttons.length, 2);
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.tag, 'button');
    assert.equal(button.textContent, 'Parent not identified');
    assert.equal(button.dataset.addRelation, 'PARENT');
    assert.equal(button.dataset.parentRole, 'WIFE');
    assert.equal(button.dataset.parentFamilyId, `F${index + 1}`);
  }
});

test('a family with no parents exposes both vacant roles', () => {
  const h = harness();
  h.state.families.get('F1').husbandId = '';
  const missing = h.context.relationshipGroups(h.state.people.get('A'))[0][1].filter((item) => !item.id);
  assert.deepEqual(Array.from(missing, (item) => `${item.familyId}:${item.parentRole}`), ['F1:HUSB', 'F1:WIFE', 'F2:WIFE']);
});

test('clicking a missing parent opens its family and retains it when selecting an existing person', () => {
  const h = harness();
  h.context.event = {
    target: { closest: () => ({ dataset: { addRelation: 'PARENT', parentRole: 'WIFE', parentFamilyId: 'F2' } }) }
  };
  const start = source.indexOf("    const addRelationButton = event.target.closest('button[data-add-relation]');");
  const end = source.indexOf('    const editRelationButton =', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(`(function () { ${source.slice(start, end)} })();`, h.context);
  assert.equal(h.opened(), 1);
  assert.equal(h.field('relativeType').value, 'PARENT');
  assert.equal(h.field('relativeParentRole').value, 'WIFE');
  assert.equal(h.field('relativeFamily').value, 'F2');
  h.field('relativeMode').value = 'EXISTING';
  h.context.syncRelativeEntryMode();
  assert.equal(h.field('relativeFamily').value, 'F2');
  assert.equal(h.field('relativeExistingFields').hidden, false);
  h.field('relativeExistingPerson').value = 'D';
  assert.equal(h.context.createRelativeRecord(), true);
  assert.ok(h.state.gedcomRecords.find((record) => record.xref === 'F2').lines.includes('1 WIFE @D@'));
  assert.equal(h.state.gedcomRecords.filter((record) => record.tag === 'INDI').length, 4);
});

test('creating a missing parent fills the chosen family without losing its children or other parent', () => {
  const h = harness();
  h.context.openRelativeEditor('PARENT', 'WIFE', 'F1');
  assert.equal(h.field('relativeFamilyField').hidden, false);
  h.field('relativeGivenName').value = 'Madeup';
  assert.equal(h.context.createRelativeRecord(), true);
  const family = h.state.gedcomRecords.find((record) => record.xref === 'F1');
  assert.deepEqual(family.lines, ['0 @F1@ FAM', '1 HUSB @C@', '1 CHIL @A@', '1 CHIL @D@', '1 WIFE @INEW@']);
  assert.ok(h.state.gedcomRecords.find((record) => record.xref === 'INEW').lines.includes('1 FAMS @F1@'));
  assert.equal(h.state.gedcomRecords.find((record) => record.xref === 'A').lines.filter((line) => line === '1 FAMC @F1@').length, 1);
  assert.equal(h.state.gedcomRecords.filter((record) => record.tag === 'FAM').length, 2);
  assert.equal(h.refreshedId(), 'INEW');
});

test('new parents can still use a separate family and occupied slots fail without mutations', () => {
  const h = harness();
  h.context.openRelativeEditor('PARENT', 'WIFE', 'F1');
  h.field('relativeGivenName').value = 'Madeup';
  h.state.families.get('F1').wifeId = 'D';
  const before = JSON.stringify(h.state.gedcomRecords);
  assert.equal(h.context.createRelativeRecord(), false);
  assert.equal(JSON.stringify(h.state.gedcomRecords), before);
  assert.equal(h.field('relativeError').hidden, false);
  h.field('relativeFamily').value = '';
  assert.equal(h.context.createRelativeRecord(), true);
  assert.ok(h.state.gedcomRecords.find((record) => record.xref === 'FNEW').lines.includes('1 WIFE @INEW@'));
});
