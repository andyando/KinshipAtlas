'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('  function formatGedcomDate(');
const end = source.indexOf('  function splitGedcomRecords(', start);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);

test('partial and qualified dates preserve their recorded precision', () => {
  for (const date of ['1883', 'MAR 1883', 'ABT 1883', 'BEF MAR 1883', '12 MAR 1883', '']) {
    assert.equal(context.enteredGedcomDate(date), date);
  }
  assert.equal(context.enteredGedcomDate('  MAR 1883  '), 'MAR 1883');
  assert.equal(context.enteredGedcomDate('1883-03-12'), '12 MAR 1883');
});

test('calendar only reflects valid full dates, never invents missing components', () => {
  for (const date of ['1883', 'MAR 1883', 'ABT 1883', '31 FEB 1883', '29 FEB 1900', '']) {
    assert.equal(context.datePickerValue(date), '');
  }
  assert.equal(context.datePickerValue('12 MAR 1883'), '1883-03-12');
  assert.equal(context.datePickerValue('29 FEB 2000'), '2000-02-29');
  assert.equal(context.formatGedcomDate('1883-03-12'), '12 MAR 1883');
});

test('all structured date entry forms offer free text and an optional exact-date picker', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const id of ['newGedcomBirthDate', 'relativeBirthDate', 'relativeDeathDate',
    'personSummaryBirthDate', 'personSummaryDeathDate', 'lifeEventDate']) {
    assert.ok(html.includes(`id="${id}" type="text"`), id);
    assert.ok(html.includes(`id="${id}Picker" type="date"`), `${id}Picker`);
  }
});
