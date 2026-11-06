'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..');

function loadReleases() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(appDir, 'version.js'), 'utf8'), context);
  return context.window.KINSHIP_VERSION.releases;
}

const parse = (version) => version.split('.').map(Number);

test('every release has a MAJOR.MINOR.PATCH version, a real date, and at least one change', () => {
  const releases = loadReleases();
  assert.ok(releases.length > 0);
  for (const release of releases) {
    assert.match(release.version, /^\d+\.\d+\.\d+$/, `bad version "${release.version}"`);
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `bad date for ${release.version}`);
    assert.ok(!Number.isNaN(Date.parse(`${release.date}T00:00:00Z`)), `invalid date for ${release.version}`);
    assert.ok(Array.isArray(release.changes) && release.changes.length > 0, `no changes listed for ${release.version}`);
    for (const change of release.changes) assert.ok(typeof change === 'string' && change.trim(), `empty change in ${release.version}`);
  }
});

test('releases are listed newest first with increasing, unique versions and dates', () => {
  const releases = loadReleases();
  for (let index = 1; index < releases.length; index += 1) {
    const newer = parse(releases[index - 1].version);
    const older = parse(releases[index].version);
    const name = releases[index - 1].version;
    const changedAt = newer.findIndex((part, position) => part !== older[position]);
    assert.ok(changedAt >= 0 && newer[changedAt] > older[changedAt], `${name} should be newer than ${releases[index].version}`);
    for (let position = changedAt + 1; position < newer.length; position += 1) {
      assert.equal(newer[position], 0, `${name} should reset the parts after the one it increases to 0`);
    }
    assert.ok(releases[index - 1].date >= releases[index].date, `${name} is dated before ${releases[index].version}`);
  }
});

test('the app loads version.js before app.js', () => {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const versionAt = html.indexOf('<script src="version.js"');
  assert.ok(versionAt >= 0, 'index.html does not load version.js');
  assert.ok(versionAt < html.indexOf('<script src="app.js"'));
});
