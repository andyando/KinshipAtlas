// Updates src/modules.json line ranges and total from the module files on disk.
// Usage: node tree-app/tools/sync-modules-json.js
'use strict';
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const manifestPath = path.join(appDir, 'src', 'modules.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const eol = manifest.eol === 'crlf' ? '\r\n' : '\n';

let total = 0;
for (const module of manifest.modules) {
  const file = path.join(appDir, 'src', 'modules', module.file);
  const body = fs.readFileSync(file, 'utf8');
  const lines = body.split('\n').length - (body.endsWith('\n') ? 1 : 0);
  module.from = total + 1;
  module.to = total + lines;
  module.lines = lines;
  total += lines;
}
manifest.totalLines = total;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}${eol === '\r\n' ? '\r\n' : '\n'}`, 'utf8');
console.log(`Updated modules.json: ${total} lines from ${manifest.modules.length} modules.`);
