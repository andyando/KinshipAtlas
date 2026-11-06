'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'updater.js'), 'utf8');
const currentVersion = '1.7.2';
const latestVersion = '1.8.0';
const tag = `v${latestVersion}`;
const versionSource = `window.KINSHIP_VERSION = { releases: [{ version: '${latestVersion}' }, { version: '${currentVersion}' }] };`;
const appFiles = new Map([
  ['index.html', '<html>updated</html>'],
  ['app.js', 'window.updated = true;'],
  ['styles.css', '.updated {}'],
  ['version.js', versionSource],
  ['updater.js', 'window.KINSHIP_UPDATER = {};'],
  ['data/world-data.js', 'window.mapUpdated = true;'],
  ['user-media/photo.svg', '<svg>user photo</svg>']
]);
const protectedPaths = [
  'tree-app/primary-data.js',
  'tree-app/kinship-defaults.json',
  'tree-app/kinship-selections.json',
  'tree-app/Primary GEDCOM/family.ged',
  'tree-app/Primary Media Library/photo.jpg',
  'tree-app/family_media/photo.png',
  'tree-app/launcher/Kinship Atlas.exe',
  'tree-app/tests/updater.test.js'
];

function bytesOf(value) {
  return new Uint8Array(Buffer.from(value));
}

function gitBlobSha(bytes) {
  return crypto.createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.byteLength}\0`), Buffer.from(bytes)]))
    .digest('hex');
}

function makeTree({ includeProtected = false, corruptSha = false } = {}) {
  const tree = [...appFiles].map(([file, value]) => {
    const bytes = bytesOf(value);
    return {
      path: `tree-app/${file}`, type: 'blob', mode: '100644',
      size: bytes.byteLength, sha: gitBlobSha(bytes)
    };
  });
  if (includeProtected) {
    for (const file of protectedPaths) {
      tree.push({ path: file, type: 'blob', mode: '100644', size: 12, sha: gitBlobSha(bytesOf('protected')) });
    }
  }
  if (corruptSha) tree.find((entry) => entry.path === 'tree-app/app.js').sha = '0'.repeat(40);
  return tree;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => {
      const bytes = body instanceof Uint8Array ? body : bytesOf(body);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

function harness({ status = 200, remoteVersionSource = versionSource, includeProtected = false, corruptSha = false } = {}) {
  const tree = makeTree({ includeProtected, corruptSha });
  const versionEntry = tree.find((entry) => entry.path === 'tree-app/version.js');
  const remoteVersionBytes = bytesOf(remoteVersionSource);
  versionEntry.size = remoteVersionBytes.byteLength;
  versionEntry.sha = gitBlobSha(remoteVersionBytes);
  const api = 'https://api.github.com/repos/andyando/KinshipAtlas';
  const rawPrefix = `https://raw.githubusercontent.com/andyando/KinshipAtlas/${tag}/`;
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (url === `${api}/releases/latest`) {
      return status === 200
        ? response({ tag_name: tag, html_url: `https://github.com/andyando/KinshipAtlas/releases/tag/${tag}`, body: 'Release notes.' })
        : response({ message: 'Not Found' }, status);
    }
    if (url === `${api}/git/trees/${tag}?recursive=1`) return response({ truncated: false, tree });
    if (url === `${rawPrefix}tree-app/version.js`) return response(remoteVersionBytes);
    if (url.startsWith(rawPrefix)) {
      const file = decodeURIComponent(url.slice(rawPrefix.length));
      const relative = file.slice('tree-app/'.length);
      if (!appFiles.has(relative)) return response('Not found', 404);
      return response(bytesOf(appFiles.get(relative)));
    }
    return response('Not found', 404);
  };
  const context = vm.createContext({
    TextEncoder, TextDecoder, AbortController,
    window: { fetch, crypto: crypto.webcrypto, setTimeout, clearTimeout, showDirectoryPicker() {} }
  });
  vm.runInContext(source, context);
  return { updater: context.window.KINSHIP_UPDATER, calls };
}

function directoryHandle(files) {
  const directories = new Set(['']);
  const ensureDirectories = (fullPath) => {
    const parts = fullPath.split('/').slice(0, -1);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      directories.add(current);
    }
  };
  for (const key of files.keys()) ensureDirectories(key);

  function makeDirectory(basePath) {
    return {
      basePath,
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async resolve(other) {
        if (other.basePath === basePath) return [];
        const prefix = basePath ? `${basePath}/` : '';
        return other.basePath.startsWith(prefix) ? other.basePath.slice(prefix.length).split('/') : null;
      },
      async getDirectoryHandle(name, { create = false } = {}) {
        const fullPath = basePath ? `${basePath}/${name}` : name;
        if (!directories.has(fullPath) && !create) throw Object.assign(new Error('Missing directory'), { name: 'NotFoundError' });
        directories.add(fullPath);
        return makeDirectory(fullPath);
      },
      async getFileHandle(name, { create = false } = {}) {
        const fullPath = basePath ? `${basePath}/${name}` : name;
        if (!files.has(fullPath) && !create) throw Object.assign(new Error('Missing file'), { name: 'NotFoundError' });
        if (!files.has(fullPath)) files.set(fullPath, new Uint8Array());
        return {
          async getFile() {
            const value = files.get(fullPath).slice();
            return {
              async arrayBuffer() { return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength); },
              async text() { return Buffer.from(value).toString('utf8'); }
            };
          },
          async createWritable() {
            let written = new Uint8Array();
            return {
              async write(value) { written = new Uint8Array(value); },
              async close() { files.set(fullPath, written); },
              async abort() {}
            };
          }
        };
      },
      async removeEntry(name) {
        const fullPath = basePath ? `${basePath}/${name}` : name;
        if (!files.delete(fullPath)) throw Object.assign(new Error('Missing file'), { name: 'NotFoundError' });
      }
    };
  }
  return makeDirectory('');
}

test('update checks reject an installation without an allocated version before contacting GitHub', async () => {
  const h = harness();
  await assert.rejects(h.updater.checkForUpdate('1.7.3', [{ version: currentVersion }]), /not using an allocated/);
  assert.equal(h.calls.length, 0);
});

test('update checks report when the public GitHub repository is unreachable', async () => {
  const h = harness({ status: 404 });
  await assert.rejects(h.updater.checkForUpdate(currentVersion, [{ version: currentVersion }]), /public GitHub repository/);
});

test('update checks require the installed version to appear in the published version history', async () => {
  const h = harness({ remoteVersionSource: `window.KINSHIP_VERSION = { releases: [{ version: '${latestVersion}' }] };` });
  await assert.rejects(h.updater.checkForUpdate(currentVersion, [{ version: currentVersion }]), /not an allocated version/);
});

test('update checks identify a newer numbered published release', async () => {
  const h = harness();
  const update = await h.updater.checkForUpdate(currentVersion, [{ version: currentVersion }]);
  assert.equal(update.available, true);
  assert.equal(update.latestVersion, latestVersion);
  assert.equal(update.tag, tag);
  assert.equal(update.releaseNotes, 'Release notes.');
});

test('the updater script loads before the application script', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const updaterAt = html.indexOf('<script src="updater.js"');
  assert.ok(updaterAt >= 0, 'index.html does not load updater.js');
  assert.ok(updaterAt < html.indexOf('<script src="app.js"'), 'updater.js must load before app.js');
});

test('installation updates app files only and preserves local family data and preferences', async () => {
  const initialFiles = new Map([
    ['index.html', bytesOf('<html>old</html>')],
    ['app.js', bytesOf('window.old = true;')],
    ['styles.css', bytesOf('.old {}')],
    ['version.js', bytesOf(`window.KINSHIP_VERSION = { releases: [{ version: '${currentVersion}' }] };`)],
    ['updater.js', bytesOf('window.oldUpdater = true;')],
    ['primary-data.js', bytesOf('private GEDCOM text')],
    ['kinship-defaults.json', bytesOf('private default settings')],
    ['kinship-selections.json', bytesOf('private image selections')],
    ['Primary GEDCOM/family.ged', bytesOf('private family tree')],
    ['Primary Media Library/photo.jpg', bytesOf('private photo')],
    ['family_media/photo.png', bytesOf('private media')]
  ]);
  const protectedBefore = new Map([...initialFiles].filter(([key]) => key !== 'index.html'
    && key !== 'app.js' && key !== 'styles.css' && key !== 'version.js' && key !== 'updater.js')
    .map(([key, value]) => [key, value.slice()]));
  const root = directoryHandle(initialFiles);
  const h = harness({ includeProtected: true });
  const update = await h.updater.checkForUpdate(currentVersion, [{ version: currentVersion }]);
  const count = await h.updater.installUpdate(update, Promise.resolve(root));
  assert.equal(count, appFiles.size);
  for (const [file, value] of appFiles) {
    assert.equal(Buffer.from(initialFiles.get(file)).toString('utf8'), value, file);
  }
  for (const [file, value] of protectedBefore) {
    assert.deepEqual(initialFiles.get(file), value, file);
  }
  assert.equal(initialFiles.has('Kinship Atlas.exe'), false);
});

test('installation excludes a currently selected media folder inside the application folder', async () => {
  const initialFiles = new Map([
    ['index.html', bytesOf('<html>old</html>')],
    ['app.js', bytesOf('window.old = true;')],
    ['styles.css', bytesOf('.old {}')],
    ['version.js', bytesOf(`window.KINSHIP_VERSION = { releases: [{ version: '${currentVersion}' }] };`)],
    ['updater.js', bytesOf('window.oldUpdater = true;')],
    ['user-media/photo.svg', bytesOf('<svg>private photo</svg>')]
  ]);
  const root = directoryHandle(initialFiles);
  const mediaDirectory = await root.getDirectoryHandle('user-media');
  const h = harness();
  const update = await h.updater.checkForUpdate(currentVersion, [{ version: currentVersion }]);
  const count = await h.updater.installUpdate(update, root, [mediaDirectory]);
  assert.equal(count, appFiles.size - 1);
  assert.equal(Buffer.from(initialFiles.get('user-media/photo.svg')).toString('utf8'), '<svg>private photo</svg>');
});

test('integrity failure happens before any application file is written', async () => {
  const initialFiles = new Map([
    ['index.html', bytesOf('<html>old</html>')],
    ['app.js', bytesOf('window.old = true;')],
    ['styles.css', bytesOf('.old {}')],
    ['version.js', bytesOf(`window.KINSHIP_VERSION = { releases: [{ version: '${currentVersion}' }] };`)],
    ['updater.js', bytesOf('window.oldUpdater = true;')]
  ]);
  const before = new Map([...initialFiles].map(([key, value]) => [key, value.slice()]));
  const h = harness({ corruptSha: true });
  const update = await h.updater.checkForUpdate(currentVersion, [{ version: currentVersion }]);
  await assert.rejects(h.updater.installUpdate(update, Promise.resolve(directoryHandle(initialFiles))), /integrity verification/);
  assert.deepEqual(initialFiles, before);
});
