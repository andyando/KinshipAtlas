'use strict';

(() => {
  const owner = 'andyando';
  const repository = 'KinshipAtlas';
  const apiBase = `https://api.github.com/repos/${owner}/${repository}`;
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repository}`;
  const maxFiles = 300;
  const maxFileBytes = 10 * 1024 * 1024;
  const maxTotalBytes = 30 * 1024 * 1024;
  const updateExtensions = new Set(['.html', '.js', '.css', '.svg', '.png', '.ico']);
  const protectedNames = new Set(['primary-data.js', 'kinship-defaults.json', 'kinship-selections.json']);
  const encoder = new TextEncoder();

  function parseVersions(versionSource) {
    return [...versionSource.matchAll(/\bversion\s*:\s*['"](\d+\.\d+\.\d+)['"]/g)].map((match) => match[1]);
  }

  function validVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
  }

  function compareVersions(left, right) {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
  }

  async function fetchResponse(url, label) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      let response;
      try {
        response = await window.fetch(url, {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller.signal
        });
      } catch (error) {
        if (error.name === 'AbortError') throw new Error(`${label} timed out. Check your internet connection and try again.`);
        throw new Error(`Could not reach the public GitHub repository. Check your internet connection and make sure the repository is public.`);
      }
      if (response.status === 404) {
        throw new Error(`Could not reach the public GitHub repository or find a published release. Check that the repository is public and try again.`);
      }
      if (response.status === 403 || response.status === 429) {
        throw new Error('GitHub temporarily refused the update request. Wait a few minutes and try again.');
      }
      if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status}).`);
      return response;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function fetchJson(url, label) {
    const response = await fetchResponse(url, label);
    try {
      return await response.json();
    } catch {
      throw new Error(`${label} returned an invalid response.`);
    }
  }

  async function checkForUpdate(currentVersion, localReleases) {
    if (!validVersion(currentVersion) || !Array.isArray(localReleases)
      || !localReleases.some((release) => release?.version === currentVersion)) {
      throw new Error('This installation is not using an allocated MAJOR.MINOR.PATCH version. Update is unavailable.');
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('Updating requires a browser with local folder access, such as Edge or Chrome.');
    }

    const latest = await fetchJson(`${apiBase}/releases/latest`, 'Checking for the latest release');
    const match = String(latest.tag_name || '').match(/^v?(\d+\.\d+\.\d+)$/);
    if (!match || latest.draft || latest.prerelease) {
      throw new Error('The latest GitHub release does not have an allocated stable MAJOR.MINOR.PATCH version.');
    }
    const latestVersion = match[1];
    const tag = latest.tag_name;
    const tree = await fetchJson(`${apiBase}/git/trees/${encodeURIComponent(tag)}?recursive=1`, 'Reading the release files');
    if (tree.truncated || !Array.isArray(tree.tree)) {
      throw new Error('GitHub returned an incomplete release file list.');
    }

    const versionEntry = tree.tree.find((entry) => entry.path === 'tree-app/version.js' && entry.type === 'blob');
    if (!versionEntry || !/^[a-f0-9]{40}$/i.test(versionEntry.sha)) {
      throw new Error('The release does not contain a valid version history.');
    }
    const versionResponse = await fetchResponse(`${rawBase}/${encodeURIComponent(tag)}/tree-app/version.js`, 'Checking the release version history');
    const versionBytes = new Uint8Array(await versionResponse.arrayBuffer());
    if (await gitBlobSha(versionBytes) !== versionEntry.sha.toLocaleLowerCase()) {
      throw new Error('The release version history failed GitHub integrity verification.');
    }
    const remoteVersions = parseVersions(new TextDecoder().decode(versionBytes));
    if (remoteVersions[0] !== latestVersion || !remoteVersions.includes(currentVersion)) {
      throw new Error(`This installation's version (${currentVersion}) is not an allocated version in the published GitHub release history.`);
    }
    if (compareVersions(latestVersion, currentVersion) < 0) {
      throw new Error('The latest published release is older than this installation. No files were changed.');
    }

    return {
      available: compareVersions(latestVersion, currentVersion) > 0,
      currentVersion,
      latestVersion,
      tag,
      releaseUrl: typeof latest.html_url === 'string' ? latest.html_url : '',
      releaseNotes: typeof latest.body === 'string' ? latest.body : ''
    };
  }

  function updatePath(path, protectedMediaPaths = []) {
    if (typeof path !== 'string' || !path.startsWith('tree-app/')) return null;
    const relative = path.slice('tree-app/'.length);
    const parts = relative.split('/');
    if (!relative || parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) return null;
    const lowerParts = parts.map((part) => part.toLocaleLowerCase());
    if (lowerParts.some((part) => part === 'primary gedcom' || part === 'primary media library'
      || part === 'private' || part.endsWith('_media') || part === 'backups'
      || part === 'launcher' || part === 'tests')) return null;
    if (protectedMediaPaths.some((mediaPath) => !mediaPath.length
      || mediaPath.every((part, index) => lowerParts[index] === part.toLocaleLowerCase()))) return null;
    const fileName = lowerParts.at(-1);
    if (protectedNames.has(fileName) || /\.(?:ged|gedcom|gramps|sqlite3?|db)$/.test(fileName)) return null;
    const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
    if (!updateExtensions.has(extension)) return null;
    return relative;
  }

  async function gitBlobSha(bytes) {
    if (!window.crypto?.subtle) throw new Error('This browser cannot verify downloaded update files securely.');
    const header = encoder.encode(`blob ${bytes.byteLength}\0`);
    const input = new Uint8Array(header.byteLength + bytes.byteLength);
    input.set(header);
    input.set(bytes, header.byteLength);
    const digest = await window.crypto.subtle.digest('SHA-1', input);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function fetchUpdateFile(entry, tag) {
    const url = `${rawBase}/${encodeURIComponent(tag)}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetchResponse(url, `Downloading ${entry.path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== entry.size) throw new Error(`Downloaded file size did not match GitHub's file list: ${entry.path}`);
    if (await gitBlobSha(bytes) !== entry.sha.toLocaleLowerCase()) {
      throw new Error(`Downloaded file failed GitHub integrity verification: ${entry.path}`);
    }
    return { path: updatePath(entry.path), bytes };
  }

  async function mapLimit(items, limit, action) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await action(items[index]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  async function getDirectory(root, parts, create) {
    let directory = root;
    for (const part of parts) {
      try {
        directory = await directory.getDirectoryHandle(part, { create });
      } catch (error) {
        if (!create && error.name === 'NotFoundError') return null;
        throw error;
      }
    }
    return directory;
  }

  async function findProtectedMediaPaths(root, mediaDirectories) {
    const paths = [];
    for (const directory of new Set(mediaDirectories.filter(Boolean))) {
      if (typeof root.resolve !== 'function' || typeof directory.resolve !== 'function') {
        throw new Error('The selected media folder could not be verified. No application files were changed.');
      }
      const mediaPath = await root.resolve(directory);
      if (mediaPath !== null) paths.push(mediaPath);
      if (await directory.resolve(root) !== null) {
        throw new Error('The selected application folder is inside a media folder. Choose a separate application folder to avoid changing media.');
      }
    }
    return paths;
  }

  async function existingFile(root, relative) {
    const parts = relative.split('/');
    const directory = await getDirectory(root, parts.slice(0, -1), false);
    if (!directory) return null;
    try {
      return await directory.getFileHandle(parts.at(-1));
    } catch (error) {
      if (error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function writeFile(root, relative, bytes) {
    const parts = relative.split('/');
    const directory = await getDirectory(root, parts.slice(0, -1), true);
    const file = await directory.getFileHandle(parts.at(-1), { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
  }

  async function installUpdate(update, rootPromise, mediaDirectories = []) {
    if (!update?.available || !validVersion(update.latestVersion) || !/^v?\d+\.\d+\.\d+$/.test(update.tag)) {
      throw new Error('The selected update is invalid.');
    }
    const root = await rootPromise;
    const permission = await root.queryPermission({ mode: 'readwrite' });
    const granted = permission === 'granted' ? permission : await root.requestPermission({ mode: 'readwrite' });
    if (granted !== 'granted') throw new Error('Write access to the application folder was not granted.');
    const protectedMediaPaths = await findProtectedMediaPaths(root, mediaDirectories);

    for (const name of ['index.html', 'app.js', 'version.js']) await root.getFileHandle(name);
    const installedVersionFile = await root.getFileHandle('version.js').then((handle) => handle.getFile());
    if (parseVersions(await installedVersionFile.text())[0] !== update.currentVersion) {
      throw new Error('The selected folder is not the application folder for this running version.');
    }

    const tree = await fetchJson(`${apiBase}/git/trees/${encodeURIComponent(update.tag)}?recursive=1`, 'Reading the release files');
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('GitHub returned an incomplete release file list.');
    const entries = tree.tree.filter((entry) => entry.type === 'blob' && entry.mode === '100644'
      && updatePath(entry.path, protectedMediaPaths) && Number.isSafeInteger(entry.size) && entry.size >= 0
      && entry.size <= maxFileBytes && /^[a-f0-9]{40}$/i.test(entry.sha));
    if (entries.length === 0 || entries.length > maxFiles
      || entries.reduce((total, entry) => total + entry.size, 0) > maxTotalBytes) {
      throw new Error('The release file list is empty or exceeds the safe update size limits.');
    }
    const updates = await mapLimit(entries, 4, (entry) => fetchUpdateFile(entry, update.tag));
    for (const name of ['index.html', 'app.js', 'styles.css', 'version.js', 'updater.js']) {
      if (!updates.some((file) => file.path === name)) throw new Error(`The release is missing required application file ${name}.`);
    }

    const backups = [];
    for (const file of updates) {
      const handle = await existingFile(root, file.path);
      backups.push({
        path: file.path,
        bytes: handle ? new Uint8Array(await (await handle.getFile()).arrayBuffer()) : null
      });
    }

    let applied = 0;
    try {
      for (const [index, file] of updates.entries()) {
        applied = index + 1;
        await writeFile(root, file.path, file.bytes);
      }
    } catch (error) {
      const rollbackErrors = [];
      for (const backup of backups.slice(0, applied).reverse()) {
        try {
          if (backup.bytes) await writeFile(root, backup.path, backup.bytes);
          else {
            const parts = backup.path.split('/');
            const directory = await getDirectory(root, parts.slice(0, -1), false);
            if (directory) await directory.removeEntry(parts.at(-1));
          }
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError.message);
        }
      }
      const recovery = rollbackErrors.length ? ' Some files could not be restored; keep this folder unchanged and retry after checking its contents.' : ' No partial update was left behind.';
      throw new Error(`The update could not be installed: ${error.message}.${recovery}`);
    }

    return updates.length;
  }

  window.KINSHIP_UPDATER = { checkForUpdate, installUpdate };
})();
