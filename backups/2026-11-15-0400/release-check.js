'use strict';

(() => {
  const api = 'https://api.github.com/repos/andyando/KinshipAtlas';
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

  async function checkForUpdate(currentVersion, releases) {
    if (!semver.test(currentVersion) || !Array.isArray(releases)
      || releases[0]?.version !== currentVersion) {
      throw new Error('This installation does not have an allocated MAJOR.MINOR.PATCH version.');
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await window.fetch(`${api}/releases/latest`, {
        cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(response.status === 404
          ? 'The public GitHub repository or a published stable release could not be found.'
          : `GitHub could not check for updates (HTTP ${response.status}).`);
      }
      const release = await response.json();
      const version = String(release.tag_name || '').replace(/^v/, '');
      if (!semver.test(version) || release.draft || release.prerelease) {
        throw new Error('The latest release does not have an allocated stable version.');
      }
      const historyResponse = await window.fetch(
        `https://raw.githubusercontent.com/andyando/KinshipAtlas/${encodeURIComponent(release.tag_name)}/tree-app/version.js`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!historyResponse.ok) throw new Error('The published release version history could not be reached.');
      const history = [...(await historyResponse.text()).matchAll(/\bversion\s*:\s*['"](\d+\.\d+\.\d+)['"]/g)]
        .map((match) => match[1]);
      if (history[0] !== version || !history.includes(currentVersion)) {
        throw new Error(`Version ${currentVersion} is not allocated in the published release history.`);
      }
      const a = version.split('.').map(Number);
      const b = currentVersion.split('.').map(Number);
      const index = a.findIndex((part, position) => part !== b[position]);
      if (index >= 0 && a[index] < b[index]) {
        throw new Error('This installation is newer than the latest published release.');
      }
      if (index >= 0) {
        const required = [`KinshipAtlas-Setup-${version}.exe`, `KinshipAtlas-Setup-${version}.exe.bundle.json`, 'SHA256SUMS'];
        if (!required.every((name) => release.assets?.some((asset) => asset.name === name))) {
          throw new Error('This release has no complete installer, checksum and Sigstore bundle. See GitHub Releases for manual-update guidance.');
        }
      }
      return {
        available: index >= 0, latestVersion: version,
        releaseNotes: typeof release.body === 'string' ? release.body : '',
        releaseUrl: `https://github.com/andyando/KinshipAtlas/releases/tag/${encodeURIComponent(release.tag_name)}`
      };
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The GitHub update check timed out. Try again later.');
      if (error instanceof TypeError) throw new Error('Could not reach GitHub. Check your internet connection.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  window.KINSHIP_RELEASES = { checkForUpdate };
})();
