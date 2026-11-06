'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { packageFiles } = require('../installer/package-files');
const source = fs.readFileSync(path.join(__dirname, '..', 'release-check.js'), 'utf8');

function harness({ status = 200, version = '1.9.0', assets = true, history = true } = {}) {
  const calls = [];
  const context = vm.createContext({
    AbortController, TypeError,
    window: {
      setTimeout, clearTimeout,
      fetch: async (url) => {
        calls.push(url);
        return url.endsWith('/releases/latest')
          ? { ok: status === 200, status, json: async () => ({
            tag_name: `v${version}`, draft: false, prerelease: false,
            assets: assets ? [
              { name: `KinshipAtlas-Setup-${version}.exe` },
              { name: `KinshipAtlas-Setup-${version}.exe.bundle.json` }, { name: 'SHA256SUMS' }
            ] : []
          }) }
          : { ok: true, text: async () => `version: '${version}'${history ? ", version: '1.8.0'" : ''}` };
      }
    }
  });
  vm.runInContext(source, context);
  return { check: context.window.KINSHIP_RELEASES.checkForUpdate, calls };
}

test('release check works without browser folder access and offers installer downloads', async () => {
  const h = harness();
  const result = await h.check('1.8.0', [{ version: '1.8.0' }]);
  assert.equal(result.available, true);
  assert.equal(result.releaseUrl, 'https://github.com/andyando/KinshipAtlas/releases/tag/v1.9.0');
  assert.equal(h.calls.length, 2);
});
test('unallocated versions are rejected before networking', async () => {
  const h = harness();
  await assert.rejects(h.check('development', []), /allocated/);
  assert.equal(h.calls.length, 0);
});
test('unreachable GitHub, missing installers and unknown version history are explicit errors', async () => {
  await assert.rejects(harness({ status: 404 }).check('1.8.0', [{ version: '1.8.0' }]), /could not be found/);
  await assert.rejects(harness({ assets: false }).check('1.8.0', [{ version: '1.8.0' }]), /no complete installer/);
  await assert.rejects(harness({ history: false }).check('1.8.0', [{ version: '1.8.0' }]), /not allocated/);
});
test('current releases report up to date; future installations reject downgrades', async () => {
  assert.equal((await harness({ version: '1.8.0', assets: false }).check('1.8.0', [{ version: '1.8.0' }])).available, false);
  await assert.rejects(harness().check('2.0.0', [{ version: '2.0.0' }]), /not allocated/);
});
test('installer package never picks up family files, quarantined updater or signing bundles', () => {
  const files = packageFiles([
    'tree-app/primary-data.js', 'tree-app/kinship-defaults.json',
    'tree-app/kinship-selections.json', 'tree-app/Primary GEDCOM/example.ged',
    'tree-app/family_media/photo.svg', 'tree-app/updater.js',
    'tree-app/Kinship Atlas.bundle.json', 'tree-app/flags/4x3/gb.svg'
  ]);
  assert.ok(files.includes('tree-app/flags/4x3/gb.svg'));
  assert.ok(files.includes('tree-app/release-check.js'));
  assert.ok(files.includes('tree-app/Kinship Atlas.exe'));
  assert.ok(!files.some((file) => /primary-data|kinship-defaults|kinship-selections|\.ged$|family_media|updater\.js|bundle\.json/.test(file)));
});
test('app loads release checker before app.js and exposes only a release link', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="release-check.js"') < html.indexOf('src="app.js"'));
  assert.ok(!html.includes('src="updater.js"'));
  assert.match(html, /<a id="installAppUpdate"[^>]+rel="noopener noreferrer"/);
});
