'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const statsSource = source.slice(source.indexOf('  const reportOccupationTaxonomy ='), source.indexOf('  function reportElement('));
const barsSource = source.slice(source.indexOf('  function appendReportBars('), source.indexOf('  function renderReports('));

function node(tag, className = '', text) {
  return {
    tag, className, textContent: text, style: {}, dataset: {}, children: [],
    append(...children) { this.children.push(...children); },
    prepend(child) { this.children.unshift(child); }
  };
}

function harness(occupations) {
  const people = occupations.map((values, index) => ({
    id: String(index), sex: '', name: 'Synthetic', mediaPaths: [],
    events: values.map((value) => ({ type: 'OCCU', value, place: '' }))
  }));
  const context = vm.createContext({
    state: { people: new Map(people.map((person) => [person.id, person])), families: new Map() },
    countryFlagForPlace: () => null,
    reportDateKey: () => null,
    reportElement: node,
    makeButton: (text, className) => node('button', className, text)
  });
  vm.runInContext(statsSource + barsSource, context);
  return context;
}

test('occupation counts deduplicate people and ignore case and whitespace', () => {
  const stats = harness([
    [' Farmer ', 'FARMER', 'Farm   labourer', '  '],
    ['farmer', 'Teacher'],
    ['Farm labourer', 'Teacher', 'Teacher'],
    []
  ]).buildReportStats();
  assert.equal(stats.withOccupation, 3);
  assert.equal(stats.occupations.size, 2);
  assert.equal(stats.occupations.get('agriculture & farming').count, 3);
  assert.equal(stats.occupations.get('education & academia').count, 2);
  assert.equal(stats.occupations.get('agriculture & farming').label, 'Agriculture & Farming');
});

test('blank or absent occupation entries do not count as occupations', () => {
  const stats = harness([[], ['', ' ', '\n\t']]).buildReportStats();
  assert.equal(stats.withOccupation, 0);
  assert.equal(stats.occupations.size, 0);
});

test('requested occupation variants merge into the specified report groups', () => {
  const context = harness([
    ['Laborer', 'Labourer'],
    ['LABOURER'],
    ['Importer', 'Importer, 460 4th Avenue, New York'],
    ['Merchant/Bookkeeper', 'Merchants Clerk'],
    ['Shipmaster', 'shipwright', 'Seaman', 'Sailor'],
    ['Sailor'],
    ['Farm laborer', 'Farm labourer'],
    ['Teacher']
  ]);
  const stats = context.buildReportStats();
  for (const [key, count] of [
    ['labouring & general work', 2], ['merchants, import & export', 2],
    ['clerical & administration', 1], ['maritime & shipping', 2],
    ['agriculture & farming', 1], ['education & academia', 1]
  ]) {
    assert.equal(stats.occupations.get(key).count, count, key);
  }
  assert.equal(stats.occupations.size, 6);
  assert.equal(stats.withOccupation, 8);
  assert.equal(stats.occupations.get('maritime & shipping').descriptions.size, 4);
  assert.equal(context.state.people.get('0').events[0].value, 'Laborer');
});

test('grouping uses whole words rather than unsafe approximate spelling matches', () => {
  const context = harness([]);
  for (const label of ['Clark', 'Merchantman', 'Importersville']) {
    assert.equal(context.reportOccupation(label).category, 'Unknown / Miscellaneous');
    assert.equal(context.reportOccupation(label).standard, label);
  }
  assert.equal(context.reportOccupation('Ship-master').category, 'Maritime & Shipping');
  assert.equal(context.reportOccupation('Able seaman').category, 'Maritime & Shipping');
  assert.equal(context.reportOccupation('Merchants\u2019 Clerk').category, 'Clerical & Administration');
});

const taxonomyExamples = [
  ['Agriculture & Farming', ['Farmer', 'Farmer - Eyres Farm', 'Farmworker / Crofter', 'Shepherd', 'Market Gardener', 'Horticulturist', 'Seedsman']],
  ['Engineering & Technical', ['Engineer', '1st Engineer (Ship)', 'Head Engineer (Marine)', 'Telegraphist', 'Mechanic', 'Machinist']],
  ['Education & Academia', ['Teacher', 'Schoolmaster', 'Head Teacher', 'Assistant Master', 'Principal', 'Lecturer', 'Professor', 'Student Teacher']],
  ['Healthcare & Medical', ['Doctor', 'Physician', 'Medical Officer', 'Nurse', 'Dental Nurse', 'Morbid Anatomist', 'Homeopath', 'Research Medical Staff']],
  ['Science & Research', ['Chemist', 'Analytical Chemist', 'Scientist', 'Geophysicist', 'Researcher']],
  ['Government & Public Service', ['Public Servant', 'Civil Servant', 'Customs Officer', 'Public Trustee', 'Inspector']],
  ['Law & Judiciary', ['Barrister', 'Solicitor', 'Judge', 'Doctor of Laws', 'Barrister and Solicitor']],
  ['Finance & Banking', ['Accountant', 'Bank Clerk', 'Bank Manager', 'Underwriter', 'Treasurer']],
  ['Clerical & Administration', ['Clerk', 'Mercantile Clerk', 'Merchants Clerk', 'Secretary', 'Receptionist', 'Cashier']],
  ['Printing & Publishing', ['Printer', 'Apprentice Printer', 'Compositor', 'Bookbinder', 'Printing Director']],
  ['Construction & Building Trades', ['Builder', 'Bricklayer', 'Mason', 'Stoneworker', 'Joiner', 'Plumber']],
  ['Manufacturing & Industrial', ['Blast Furnace Man', 'Chemical Manufacturing', 'Wood Machinist', 'Draft Maker', 'Extract Manufacturer', 'Spinner']],
  ['Mining & Resources', ['Miner', 'Mine Manager', 'Blacksmith/Miner']],
  ['Transport & Railways', ['Railway Employee', 'Railway Worker', 'Railway Clerk', 'Railway Porter', 'Locomotive Fireman', 'Motor Driver']],
  ['Maritime & Shipping', ['Sailor', 'Seaman', 'Shipmaster', 'Master Mariner', 'Shipwright']],
  ['Retail & Commerce', ['Grocer', 'Shopkeeper', 'Draper', "Draper's Assistant", 'Wool Buyer', 'Book Store Employee']],
  ['Merchants, Import & Export', ['Merchant', 'Importer', 'Provision Merchant', 'Chemical Merchant', 'Manufacturing Agent', 'Merchant/Bookkeeper']],
  ['Hospitality & Tourism', ['Hotel Keeper', 'Publican', 'Hostess', 'Innkeeper', 'Caf\u00e9 Operator']],
  ['Sales & Business Development', ['Traveller (Sales)', 'Commercial Traveller', 'Sales Manager']],
  ['Management & Executive', ['Manager', 'Company Manager', 'General Manager', 'Director', 'Managing Director', 'Chairman']],
  ['Trades & Craftsmanship', ['Baker', 'Basket Maker', 'Blacksmith', 'Coachbuilder', 'Mantelpiece Maker', 'Tailoress']],
  ['Protective Services', ['Police Sergeant', 'Inspector of Police']],
  ['Arts, Music & Media', ['Band Member', 'Choir Member', 'Foreign News Correspondent', 'Librarian']],
  ['Labouring & General Work', ['Labourer', 'Laborer', 'Yardman', 'Storeman', 'Bushman']],
  ['Religious Occupations', ['Catholic Priest']],
  ['Domestic / Unpaid', ['Home Duties', 'Spinster']],
  ['Unknown / Miscellaneous', ['No trade recorded', 'Unmapped synthetic role']]
];

test('all 27 controlled categories cover the supplied examples with specific roles taking precedence', () => {
  const context = harness([]);
  assert.equal(new Set(taxonomyExamples.map(([category]) => category)).size, 27);
  assert.equal(vm.runInContext('reportOccupationTaxonomy.length', context), 27);
  for (const [category, descriptions] of taxonomyExamples) {
    for (const original of descriptions) {
      const actual = context.reportOccupation(original);
      assert.equal(actual.category, category, original);
      assert.equal(actual.original, original);
      assert.ok(actual.standard);
    }
  }
});

test('original, standard and category are derived separately without changing GEDCOM wording', () => {
  const context = harness([]);
  for (const [original, standard, category] of [
    ['Head Engineer (Marine)', 'Marine Engineer', 'Engineering & Technical'],
    ['Bank Clerk, Bank of New Zealand', 'Bank Clerk', 'Finance & Banking'],
    ['Farmer, Northope, Winton', 'Farmer', 'Agriculture & Farming'],
    ['Barrister and Solicitor', 'Solicitor/Barrister', 'Law & Judiciary'],
    ['Importer, 460 4th Avenue, New York', 'Importer', 'Merchants, Import & Export'],
    ['Unmapped role, Marine Engineer Street', 'Unmapped role, Marine Engineer Street', 'Unknown / Miscellaneous']
  ]) {
    const actual = context.reportOccupation(original);
    assert.equal(actual.original, original);
    assert.equal(actual.standard, standard);
    assert.equal(actual.category, category);
  }
});

test('directory occupation filter matches each category using the report taxonomy', () => {
  const context = harness([]);
  for (const [category, descriptions] of taxonomyExamples) {
    for (const value of descriptions) {
      const person = { events: [{ type: 'OCCU', value }] };
      assert.equal(context.matchesOccupationType(person, category), true, value);
      assert.equal(context.matchesOccupationType(person, ''), true);
    }
  }
  const person = { events: [{ type: 'OCCU', value: 'Bank Clerk' }, { type: 'OCCU', value: 'Farmer' }] };
  assert.equal(context.matchesOccupationType(person, 'Finance & Banking'), true);
  assert.equal(context.matchesOccupationType(person, 'Agriculture & Farming'), true);
  assert.equal(context.matchesOccupationType(person, 'Clerical & Administration'), false);
  for (const events of [[], [{ type: 'OCCU', value: ' ' }], [{ type: 'NOTE', value: 'Farmer' }]]) {
    assert.equal(context.matchesOccupationType({ events }, 'Unknown / Miscellaneous'), false);
    assert.equal(context.matchesOccupationType({ events }, ''), true);
  }
});

test('occupation selector lists all 27 categories, retains selection and disables without a tree', () => {
  const context = harness([]);
  const select = {
    value: '', options: [],
    replaceChildren(option) { this.options = [option]; },
    add(option) { this.options.push(option); }
  };
  context.Option = function (text, value) { this.text = text; this.value = value; };
  context.elements = { occupationTypeFilter: select };
  context.state.directoryFilters = { occupationType: 'Finance & Banking' };
  context.state.people.set('synthetic', {});
  context.populateOccupationFilter();
  assert.equal(select.options.length, 28);
  assert.equal(select.disabled, false);
  assert.equal(select.value, 'Finance & Banking');
  context.state.people.clear();
  context.state.directoryFilters.occupationType = '';
  context.populateOccupationFilter();
  assert.equal(select.disabled, true);
  assert.equal(select.value, '');
});

test('occupation bars expose recorded descriptions for reviewing grouped results', () => {
  const context = harness([]);
  const panel = node('section');
  context.appendReportBars(panel, [['Shipping', 2, 'Sailor; Shipwright']], 'occupations');
  assert.equal(panel.children[0].children[0].title, 'Shipping: 2 people\nRecorded descriptions: Sailor; Shipwright');
});

test('ranked bars scale to the maximum and show only the top ten initially', () => {
  const context = harness([]);
  const panel = node('section');
  const rows = Array.from({ length: 12 }, (_, index) => [`Occupation ${index + 1}`, 12 - index]);
  context.appendReportBars(panel, rows, 'occupations');
  const bars = panel.children[0].children;
  assert.equal(bars.length, 12);
  assert.equal(bars.filter((bar) => !bar.hidden).length, 10);
  assert.equal(bars[0].children[1].children[0].style.width, '100%');
  assert.equal(bars[6].children[1].children[0].style.width, '50%');
  assert.equal(bars[11].title, 'Occupation 12: 1 person');
  assert.equal(panel.children[1].dataset.reportMore, 'Show all 12 occupations');
});

test('short country charts retain the existing shared bar output without expansion', () => {
  const context = harness([]);
  const panel = node('section');
  context.appendReportBars(panel, [['Australia', 3]], 'countries');
  assert.equal(panel.children.length, 1);
  assert.equal(panel.children[0].children[0].title, 'Australia: 3 people');
});
