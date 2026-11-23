'use strict';
// Makes the last module in src/modules.json end with exactly one "})();" line.
// The editor's formatter can turn it into "}) ();", so this runs after edits.
const fs = require('node:fs');
const path = require('node:path');

const appDir = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'src', 'modules.json'), 'utf8'));
const last = manifest.modules[manifest.modules.length - 1];
const file = path.join(appDir, 'src', 'modules', last.file);
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '').split('\n');
// Drop every trailing closer, whatever spacing the formatter left.
while (lines.length && /^\s*\}\)\s*\(\s*\)\s*;\s*$/.test(lines[lines.length - 1])) lines.pop();
while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
lines.push('})();');
fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
console.log(`${last.file}: ${lines.length} lines, ends with ${JSON.stringify(lines[lines.length - 1])}`);

// The other modules must not end with a closer either.
for (const module of manifest.modules.slice(0, -1)) {
  const other = path.join(appDir, 'src', 'modules', module.file);
  const body = fs.readFileSync(other, 'utf8');
  const tail = body.trim().split('\n').slice(-1)[0];
  if (/^\s*\}\)\s*\(\s*\)\s*;\s*$/.test(tail)) console.log(`warning: ${module.file} also ends with a closer`);
}
