'use strict';
// Tree Maintenance navigation: opening the dashboard must always leave the app
// shell visible, and the Settings entry must be wired exactly once.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');

function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing ${startMarker}`);
  return source.slice(start, end);
}

test('opening Tree Maintenance closes the views that hide the shell, then shows it', () => {
  const body = block('  function setTreeMaintenanceMode(', '  // ---------- Pedigree view ----------');
  // Both shell-hiding views are closed before the dashboard is shown.
  assert.match(body, /if \(state\.reportsMode\) setReportsMode\(false\);/, 'Reports must stand down');
  assert.match(body, /if \(state\.mediaLibraryMode\) setMediaLibraryMode\(false\);/, 'the Media library must stand down');
  assert.match(body, /elements\.appShell\.hidden = false;/, 'the shell must be made visible');
  // The dashboard still owns the panel's heading, graph and footer.
  assert.match(body, /elements\.treeMaintenanceView\.hidden = !on;/);
  assert.match(body, /elements\.viewport\.hidden = Boolean\(on\);/);
});

test('the Settings entry is delegated once, and no second click handler closes it', () => {
  assert.equal((source.match(/#treeMaintenanceMenuButton/g) || []).length > 0, true);
  // One delegated listener on the panel, driven by data on the button.
  assert.match(source, /settingsPanelElement\.addEventListener\('click'/, 'the menu click is delegated');
  assert.match(source, /event\.target\.closest\?\.\('#treeMaintenanceMenuButton'\)/, 'it looks for the entry');
  // The old per-button addEventListener wiring is gone.
  assert.ok(!/treeMaintenanceMenuButton\.addEventListener\('click'/.test(source), 'a second handler must not exist');
  assert.match(html, /id="treeMaintenanceMenuButton"/, 'the menu entry exists in the page');
});

test('the Tree Maintenance page markup and its cards are present', () => {
  for (const id of ['treeMaintenanceView', 'treeMaintenanceBackButton', 'maintenanceDataQualityCards', 'maintenanceMediaCards', 'maintenanceRepairCards', 'maintenanceOptimiseCards', 'maintenanceStatistics']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});
