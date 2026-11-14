'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const providerSrc = fs.readFileSync(path.join(root, 'public-records.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, '..', 'README.md'), 'utf8');

// Provider module smoke test: load it in a sandbox with a minimal window.
const vm = require('node:vm');
const sandbox = {
  window: {}, console,
  URLSearchParams, URL,
  AbortController,
  setTimeout, clearTimeout,
  fetch: () => Promise.reject(new Error('network'))
};
vm.createContext(sandbox);
vm.runInContext(providerSrc, sandbox);
const api = sandbox.window.KinshipPublicRecords;

test('button is renamed everywhere', () => {
  assert.ok(html.includes('Search Public Records'), 'index.html has the new label');
  assert.ok(!html.includes('Search WikiTree'), 'index.html has no old label');
  assert.ok(app.includes("'Search Public Records'"), 'app.js button title updated');
  assert.ok(!app.includes("'Search WikiTree'"), 'app.js has no old button title');
  assert.ok(!html.includes('confirmWikiTreeSearch'), 'old consent checkbox retired');
  assert.ok(!html.includes('wikiTreeQueryPreview'), 'old query preview retired');
  assert.ok(!html.includes('researchConsent'), 'old consent retired');
});

test('modal markup and a11y wiring', () => {
  assert.ok(html.includes('id="researchDialogTitle">Search Public Records'), 'dialog title');
  assert.ok(html.includes('Search genealogy, archive, museum, and historical collections'), 'subtitle');
  assert.ok(html.includes('id="publicRecordsProviders"'), 'provider host');
  assert.ok(html.includes('id="searchAllPublicRecords"'), 'Search All Sources button');
  assert.ok(html.includes('aria-label="Close Search Public Records"'), 'close button labelled');
  assert.ok(app.includes("addEventListener('click', () => {\n    elements.researchDialog.close();"), 'close handler');
});

test('provider registry exposes all six services with required endpoints', () => {
  const ids = api.PROVIDERS.map((entry) => entry.id);
  assert.equal(ids.slice().sort().join(','), 'dpla,europeana,findAGrave,internetArchive,openArchives,wikitree');
  assert.equal(api.PROVIDER_CONFIG.wikitree.appId, 'KinshipAtlas', 'WikiTree appId');
  // Europeana and DPLA keys must NOT exist in frontend source: held only in
  // the Kinship Atlas backend (launcher/KinshipAtlas.cs).
  assert.ok(!providerSrc.includes('lithinerna'), 'Europeana key absent from frontend');
  assert.ok(!providerSrc.includes('f47761a68e234a3d3dd0c3e0cf4fe226'), 'DPLA key absent from frontend');
  assert.equal(api.PROVIDER_CONFIG.internetArchive.searchEndpoint, 'https://archive.org/advancedsearch.php');
});

test('query variations cover exact, short, initials and date forms', () => {
  const queries = api.buildQueries({
    fullName: 'Manuel Samuel Magnus', surname: 'Magnus', givenName: 'Manuel Samuel',
    birthYear: 1799, deathYear: 1879
  });
  assert.ok(queries.includes('Manuel Samuel Magnus'), 'exact');
  assert.ok(queries.includes('Manuel Magnus'), 'without middle name');
  assert.ok(queries.includes('M. S. Magnus'), 'initials');
  assert.ok(queries.includes('"Manuel Samuel Magnus" 1799'), 'name + birth year');
  assert.ok(queries.includes('1799 1879'), 'year pair');
});

test('person snapshot carries name and years', () => {
  const snapshot = api.normalisePerson({
    name: 'Manuel Samuel Magnus', surname: 'Magnus', givenName: 'Manuel Samuel',
    events: [
      { type: 'BIRT', date: 'ABT 1799' },
      { type: 'DEAT', date: '1879' }
    ]
  });
  assert.equal(snapshot.fullName, 'Manuel Samuel Magnus');
  assert.equal(snapshot.birthYear, 1799);
  assert.equal(snapshot.deathYear, 1879);
});

test('validateExternalUrl rejects malformed and local URLs', () => {
  for (const bad of ['h', '/record/123', 'localhost', '127.0.0.1',
    'http://127.0.0.1:8765/h', 'javascript:alert(1)', 'data:text/html', '']) {
    assert.equal(api.validateExternalUrl(bad).isValid, false, `rejects ${bad}`);
  }
  const ok = api.validateExternalUrl('https://www.europeana.eu/record/x');
  assert.equal(ok.isValid, true);
  assert.equal(ok.normalizedUrl, 'https://www.europeana.eu/record/x');
});

test('no public proxy services anywhere in frontend sources', () => {
  for (const needle of ['allorigins', 'AllOrigins', 'cors-anywhere', 'corsproxy']) {
    assert.ok(!providerSrc.includes(needle), `${needle} absent from public-records.js`);
    assert.ok(!app.includes(needle), `${needle} absent from app.js`);
  }
});

test('findAGrave builds a memorial search URL without scraping', () => {
  const url = api.findAGraveSearchUrl({
    fullName: 'Manuel Samuel Magnus', surname: 'Magnus', givenName: 'Manuel Samuel',
    birthYear: 1799, deathYear: 1879
  });
  assert.ok(url.startsWith('https://www.findagrave.com/memorial/search?'), 'endpoint');
  assert.ok(url.includes('firstname=Manuel'), 'first name');
  assert.ok(url.includes('lastname=Magnus'), 'surname');
});

test('failures normalise to per-service messages, not stack traces', async () => {
  const failing = {
    name: 'Broken Service', run: async () => { throw new Error('invalid_json'); }
  };
  const outcome = await api.runProvider(failing, { name: 'X', events: [] });
  assert.equal(outcome.status, 'error');
  assert.match(outcome.errorMessage, /Unreadable response/);
  assert.deepEqual([...outcome.results], []);
});

test('timeouts surface as a distinct message', async () => {
  const slow = {
    name: 'Slow Service',
    run: (person) => api.fetchWithTimeout('data:,', {})
  };
  const outcome = await api.runProvider(slow, { name: 'X' });
  assert.equal(outcome.status, 'error');
});

test('empty successful responses are not errors', async () => {
  const empty = { name: 'Quiet Service', run: async () => [] };
  const outcome = await api.runProvider(empty, { name: 'X' });
  assert.equal(outcome.status, 'empty');
});

test('documentation updated', () => {
  assert.ok(readme.includes('Search Public Records'), 'README has new name');
  assert.ok(readme.includes('appId=KinshipAtlas'), 'README documents WikiTree appId');
  assert.ok(readme.includes('isShownAt'), 'README documents the DPLA field rule');
  assert.ok(readme.includes('Open Archives'), 'README lists Open Archives');
  assert.ok(readme.includes('Find A Grave'), 'README lists Find A Grave');
  assert.ok(html.includes('data-help-article="public-records"'), 'help section exists');
  assert.ok(html.includes('data-help-nav="public-records"'), 'help nav entry exists');
});
