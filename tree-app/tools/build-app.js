// Build step: concatenate src/modules/*.js (00-header … 14-map-print) into app.js.
// The byte-identical guarantee means "maintaining app.js" now means "maintaining src/modules"
// and running this script; app.js remains the deployable artifact so index.html,
// the test harness and the deployed copy keep working unchanged.
//
// Usage: node tree-app/tools/build-app.js [--check]
//   (no flag)  rebuilds app.js from the modules
//   --check    verifies the modules reassemble byte-identical to the current app.js
//              and exits non-zero if they do not (used by tests/CI)
'use strict';
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'src', 'modules.json'), 'utf8'));
const eol = manifest.eol === 'crlf' ? '\r\n' : '\n';
const built = manifest.modules.map((m, index) => {
  let body = fs.readFileSync(path.join(appDir, 'src', 'modules', m.file), 'utf8');
  if (index < manifest.modules.length - 1 && !body.endsWith(eol)) {
    throw new Error(`${m.file} does not end with the manifest EOL`);
  }
  return body;
}).join('');

const target = path.join(appDir, 'app.js');
if (process.argv.includes('--check')) {
  const current = fs.readFileSync(target, 'utf8');
  if (current !== built) {
    console.error('FAIL: src/modules/*.js no longer reassemble byte-identical to app.js.');
    process.exit(1);
  }
  console.log(`OK: ${manifest.totalLines} lines from ${manifest.modules.length} modules reassemble byte-identical to app.js.`);
} else {
  fs.writeFileSync(target, built, 'utf8');
  console.log(`Built app.js: ${manifest.totalLines} lines from ${manifest.modules.length} modules.`);
}
