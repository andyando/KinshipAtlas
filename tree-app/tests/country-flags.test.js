'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const aliasesStart = source.indexOf('  const countryFlagAliases = [');
const aliasesEnd = source.indexOf('\n  const state =', aliasesStart);
const flagFunctionStart = source.indexOf('  function countryFlagForPlace(', aliasesEnd);
const flagFunctionEnd = source.indexOf('\n  function initials(', flagFunctionStart);
const context = vm.createContext({});

vm.runInContext(
  `${source.slice(aliasesStart, aliasesEnd)}\n${source.slice(flagFunctionStart, flagFunctionEnd)}\nglobalThis.countryFlagForPlace = countryFlagForPlace;`,
  context
);

const commonsFlags = [
  ['Armenia', 'AM', 'Armenia', 'Flag_of_Armenia.svg'],
  ['Bermuda', 'BM', 'Bermuda', 'Flag_of_Bermuda.svg'],
  ['Bolivia', 'BO', 'Bolivia', 'Flag_of_Bolivia.svg'],
  ['Cuba', 'CU', 'Cuba', 'Flag_of_Cuba.svg'],
  ['Prussia', 'de-prussia', 'Prussia', 'Flag_of_Prussia_(1918–1933).svg'],
  ['Jamaica', 'JM', 'Jamaica', 'Flag_of_Jamaica.svg'],
  ['Latvia', 'LV', 'Latvia', 'Flag_of_Latvia.svg'],
  ['Papua New Guinea', 'PG', 'Papua New Guinea', 'Flag_of_Papua_New_Guinea.svg'],
  ['Puerto Rico', 'PR', 'Puerto Rico', 'Flag_of_Puerto_Rico.svg'],
  ['Palestine', 'PS', 'Palestine', 'Flag_of_Palestine.svg'],
  ['Sudan', 'SD', 'Sudan', 'Flag_of_Sudan.svg'],
  ['Tonga', 'TO', 'Tonga', 'Flag_of_Tonga.svg'],
  ['Samoa', 'WS', 'Samoa', 'Flag_of_Samoa.svg']
];

test('country flag aliases resolve to the added Commons SVG filenames', () => {
  for (const [place, code, country, file] of commonsFlags) {
    assert.deepEqual(
      { ...context.countryFlagForPlace(place) },
      { code: code.toLocaleLowerCase(), country, file },
      place
    );
    assert.deepEqual(
      { ...context.countryFlagForPlace(`Somewhere, ${place}`) },
      { code: code.toLocaleLowerCase(), country, file },
      `${place} in a longer place`
    );
    assert.ok(fs.existsSync(path.join(appDir, 'flags', '4x3', file)), `missing flag file ${file}`);
  }
});

test('historic Prussia remains distinct from Germany in country flag lookup', () => {
  assert.equal(context.countryFlagForPlace('Prussia').file, 'Flag_of_Prussia_(1918–1933).svg');
  assert.equal(context.countryFlagForPlace('Preussen').file, 'Flag_of_Prussia_(1918–1933).svg');
  assert.equal(context.countryFlagForPlace('Germany').file, 'de.svg');
});
