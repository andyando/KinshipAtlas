'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const geonamesSource = source.slice(source.indexOf('  const geonamesUsernameKey'), source.indexOf('  function renderBirthCountrySuggestionCell('));

function harness(responses = []) {
  const requests = [];
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      requests.push({ url: new URL(url), options });
      const next = responses.shift() || { geonames: [] };
      return { ok: !next.status, status: next.status ? 401 : 200, json: async () => next };
    }
  });
  vm.runInContext(geonamesSource, context);
  return { context, requests };
}

const leicester = { name: 'Leicester', adminName1: 'England', countryName: 'United Kingdom', countryCode: 'GB' };

test('UK matches suggest the constituent nation and other countries use the GeoNames country name', () => {
  const { context } = harness();
  assert.equal(context.geonamesCountryLabel(leicester), 'England');
  assert.equal(context.geonamesCountryLabel({ countryCode: 'GB', adminName1: 'Scotland' }), 'Scotland');
  assert.equal(context.geonamesCountryLabel({ countryCode: 'GB', adminName1: '' }), 'United Kingdom');
  assert.equal(context.geonamesCountryLabel({ countryCode: 'AU', countryName: 'Australia' }), 'Australia');
});

test('suggestions keep GeoNames ranking, remove duplicate countries, and stop at three', () => {
  const { context } = harness();
  const options = context.geonamesCountryOptions([
    leicester, { ...leicester, name: 'Leicester Forest East' },
    { name: 'Leicester', adminName1: 'Massachusetts', countryName: 'United States', countryCode: 'US' },
    { name: 'Leicester', adminName1: 'Queensland', countryName: 'Australia', countryCode: 'AU' },
    { name: 'Leicester', countryName: 'Canada', countryCode: 'CA' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(options)), [
    { country: 'England', match: 'Leicester, England, United Kingdom' },
    { country: 'United States', match: 'Leicester, Massachusetts, United States' },
    { country: 'Australia', match: 'Leicester, Queensland, Australia' }
  ]);
});

test('accepting appends the country after the existing birth location', () => {
  const { context } = harness();
  assert.equal(context.appendCountryToPlace('Leicester, Leicestershire, ', 'England'), 'Leicester, Leicestershire, England');
  assert.equal(context.appendCountryToPlace('  Perth ', 'Scotland'), 'Perth, Scotland');
});

test('lookups send only the place over HTTPS and fall back to the first place part', async () => {
  const { context, requests } = harness([{ geonames: [] }, { geonames: [leicester] }]);
  const options = await context.suggestCountriesForPlace('Leicester, Leicestershire', 'example-user');
  assert.equal(options[0].country, 'England');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.origin, 'https://secure.geonames.org');
  assert.deepEqual([...requests[0].url.searchParams.keys()].sort(), ['maxRows', 'q', 'style', 'username']);
  assert.equal(requests[0].url.searchParams.get('q'), 'Leicester, Leicestershire');
  assert.equal(requests[1].url.searchParams.get('q'), 'Leicester');
  assert.equal(requests[1].url.searchParams.get('isNameRequired'), 'true');
  assert.equal(requests[0].options.credentials, 'omit');
});

test('GeoNames account errors are reported with guidance', async () => {
  const { context } = harness([{ status: { message: 'user does not exist.', value: 10 } }]);
  await assert.rejects(context.suggestCountriesForPlace('Leicester', 'missing'), /user does not exist\..*Manage account/);
});

test('a GeoNames request that never answers times out instead of hanging', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout,
    fetch: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })
  });
  vm.runInContext(geonamesSource, context);
  const lookup = context.suggestCountriesForPlace('Leicester', 'example-user');
  t.mock.timers.tick(15000);
  await assert.rejects(lookup, /did not respond within 15 seconds/);
});

test('stopping a lookup rejects without reporting a timeout', async () => {
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout,
    fetch: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })
  });
  vm.runInContext(geonamesSource, context);
  const controller = new AbortController();
  const lookup = context.suggestCountriesForPlace('Leicester', 'example-user', controller.signal);
  controller.abort();
  await assert.rejects(lookup, /^Error: aborted$/);
});
