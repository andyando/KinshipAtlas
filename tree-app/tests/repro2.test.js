'use strict';
// Full end-to-end repro through the submit handler with the real listener wiring.
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
    const element = {
      tag, children: [], dataset: {}, hidden: false,
      get value() { return value; },
      set value(next) { value = next; },
      get options() { return element.children; },
      get files() { return null; },
      append(...children) {
        this.children.push(...children);
        if (tag === 'select' && children.length && this.children.length === children.length) value = children[0].value;
      },
      replaceChildren(...children) { this.children = []; value = ''; this.append(...children); },
      closest() { return this; },
      querySelectorAll() { return []; },
      setAttribute(name, next) { this[name] = next; },
      focus() { },
      addEventListener(type, handler) { (element.handlers[type] ||= []).push(handler); },
      handlers: {}
    };
    return element;
  }
  const field = (id) => {
    if (!nodes.has(id)) nodes.set(id, node(['relativeFamily', 'relativeSpouse', 'relativeExistingPerson', 'relativeType', 'relativeMode', 'relativeParentRole'].includes(id) ? 'select' : 'input'));
    return nodes.get(id);
  };
  const people = new Map([
    ['I220', { id: 'I220', name: 'Michael Magnus', sex: 'M', events: [], parentFamilyIds: ['F713'], spouseFamilyIds: [] }],
    ['I219', { id: 'I219', name: 'Andrew Franklin Magnus', sex: 'M', events: [], parentFamilyIds: [], spouseFamilyIds: ['F713', 'F714', 'F716'] }],
    ['I238', { id: 'I238', name: 'Melanie Jeanne Smith', sex: 'F', events: [], parentFamilyIds: [], spouseFamilyIds: ['F716'] }],
    ['I235', { id: 'I235', name: 'Pamela Irene Hill', sex: 'F', events: [], parentFamilyIds: [], spouseFamilyIds: ['F714'] }]
  ]);
  const state = {
    selectedId: 'I220', people,
    families: new Map([
      ['F713', { id: 'F713', husbandId: 'I219', wifeId: '', childIds: ['I220'] }],
      ['F714', { id: 'F714', husbandId: 'I219', wifeId: 'I235', childIds: [] }],
      ['F716', { id: 'F716', husbandId: 'I219', wifeId: 'I238', childIds: [] }]
    ]),
    gedcomRecords: [
      ...[...people.keys()].map((id) => ({ xref: id, tag: 'INDI', lines: [`0 @${id}@ INDI`, `1 NAME ${people.get(id).name}`] })),
      { xref: 'F713', tag: 'FAM', lines: ['0 @F713@ FAM', '1 HUSB @I219@', '1 CHIL @I220@'] },
      { xref: 'F714', tag: 'FAM', lines: ['0 @F714@ FAM', '1 HUSB @I219@', '1 WIFE @I235@'] },
      { xref: 'F716', tag: 'FAM', lines: ['0 @F716@ FAM', '1 HUSB @I219@', '1 WIFE @I238@'] }
    ]
  };
  const elements = {
    relativeType: field('relativeType'),
    relativeParentRole: field('relativeParentRole'),
    relativeParentRoleField: field('relativeParentRoleField'),
    addRelativeForm: Object.assign(field('addRelativeForm'), {
      reset() { for (const entry of nodes.values()) if (entry !== field('addRelativeForm')) entry.value = ''; },
      addEventListener() { }
    }),
    addRelativeDialog: { showModal() { }, close() { } }
  };
  const context = vm.createContext({
    state, elements,
    ensurePersonMediaFolders: async () => 0,
    document: { querySelector: (selector) => field(selector.slice(1)), getElementById: field, createElement: node },
    personName: (id) => people.get(id)?.name,
    lifespan: () => '',
    partnersOf: (personId) => {
      const out = [];
      for (const family of state.families.values()) {
        if (family.husbandId === personId && family.wifeId) out.push({ id: family.wifeId, family });
        if (family.wifeId === personId && family.husbandId) out.push({ id: family.husbandId, family });
      }
      return out;
    },
    normalizeDirectoryName: (text) => (text || '').toLowerCase(),
    showToast() { },
    cleanGedcomValue: (value) => (value || '').trim(),
    enteredGedcomDate: (value) => value,
    nextGedcomXref: (prefix) => `${prefix}NEW`,
    appendRecordLine: (record, line) => { if (!record.lines.includes(line)) record.lines.push(line); },
    addRecordBeforeTrailer: (record) => state.gedcomRecords.push(record),
    refreshAfterGedcomMutation: () => { }
  });
  const fnStart = source.indexOf('  function existingRelativeCandidates(');
  const fnEnd = source.indexOf('  const relationshipSentences =');
  vm.runInContext(source.slice(fnStart, fnEnd), context);
  // Wire the same listeners the app wires (submit + change handlers).
  const listenerStart = source.indexOf("  elements.addRelativeForm.addEventListener('submit'");
  const listenerEnd = source.indexOf("  document.querySelector('#relativeSearch').addEventListener", listenerStart);
  vm.runInContext(source.slice(listenerStart, listenerEnd), context);
  return { context, state, field, nodes };
}

test('end-to-end: pick Melanie from the list and submit', async () => {
  const h = harness();
  // Simulate the click on the card's "Parent not identified" button.
  h.context.event = { target: { closest: () => ({ dataset: { addRelation: 'PARENT', parentRole: 'WIFE', parentFamilyId: 'F713' } }) } };
  const clickStart = h.context.source ? 0 : 0;
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const clickHandlerStart = src.indexOf("    const addRelationButton = event.target.closest('button[data-add-relation]');");
  const clickHandlerEnd = src.indexOf('    const editRelationButton =', clickHandlerStart);
  vm.runInContext(`(function(){ ${src.slice(clickHandlerStart, clickHandlerEnd)} })();`, h.context);
  assert.equal(h.field('relativeFamily').value, 'F713');
  h.field('relativeMode').value = 'EXISTING';
  h.field('relativeMode').handlers.change.forEach((handler) => handler());
  // User picks Melanie in the list.
  h.field('relativeExistingPerson').value = 'I238';
  test('end-to-end: picking only the other-parent dropdown still links her as mother', async () => {
    const h = harness();
    h.context.event = { target: { closest: () => ({ dataset: { addRelation: 'PARENT', parentRole: 'WIFE', parentFamilyId: 'F713' } }) } };
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const clickHandlerStart = src.indexOf("    const addRelationButton = event.target.closest('button[data-add-relation]');");
    const clickHandlerEnd = src.indexOf('    const editRelationButton =', clickHandlerStart);
    vm.runInContext(`(function(){ ${src.slice(clickHandlerStart, clickHandlerEnd)} })();`, h.context);
    h.field('relativeMode').value = 'EXISTING';
    h.field('relativeMode').handlers.change.forEach((handler) => handler());
    // User leaves "Select person" empty and only picks Melanie in the
    // other-parent dropdown — the app should add her as the mother.
    h.field('relativeSpouse').value = 'I238';
    const submitEvent = { preventDefault() { } };
    for (const handler of h.field('addRelativeForm').handlers.submit || []) await handler(submitEvent);
    const family = h.state.gedcomRecords.find((record) => record.xref === 'F713');
    assert.ok(family.lines.includes('1 WIFE @I238@'), `lines: ${family.lines.join(' | ')}`);
  });
  const family = h.state.gedcomRecords.find((record) => record.xref === 'F713');
  assert.ok(family.lines.includes('1 WIFE @I238@'), `lines: ${family.lines.join(' | ')}`);
});
