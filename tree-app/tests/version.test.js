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

test('every release has a MAJOR.MINOR version, a real date, and at least one change', () => {
  const releases = loadReleases();
  assert.ok(releases.length > 0);
  for (const release of releases) {
    assert.match(release.version, /^\d+\.\d+$/, `bad version "${release.version}"`);
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `bad date for ${release.version}`);
    assert.ok(!Number.isNaN(Date.parse(`${release.date}T00:00:00Z`)), `invalid date for ${release.version}`);
    assert.ok(Array.isArray(release.changes) && release.changes.length > 0, `no changes listed for ${release.version}`);
    for (const change of release.changes) assert.ok(typeof change === 'string' && change.trim(), `empty change in ${release.version}`);
  }
});

test('releases are listed newest first with increasing, unique versions and dates', () => {
  const releases = loadReleases();
  for (let index = 1; index < releases.length; index += 1) {
    const [newerMajor, newerMinor] = parse(releases[index - 1].version);
    const [olderMajor, olderMinor] = parse(releases[index].version);
    assert.ok(newerMajor > olderMajor || (newerMajor === olderMajor && newerMinor > olderMinor),
      `${releases[index - 1].version} should be newer than ${releases[index].version}`);
    if (newerMajor > olderMajor) assert.equal(newerMinor, 0, `MINOR should reset to 0 for ${releases[index - 1].version}`);
    assert.ok(releases[index - 1].date >= releases[index].date, `${releases[index - 1].version} is dated before ${releases[index].version}`);
  }
});

test('the app loads version.js before app.js', () => {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const versionAt = html.indexOf('<script src="version.js"');
  assert.ok(versionAt >= 0, 'index.html does not load version.js');
  assert.ok(versionAt < html.indexOf('<script src="app.js"'));
});
