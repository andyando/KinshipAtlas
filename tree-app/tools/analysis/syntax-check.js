'use strict';
// Syntax-checks every module the app is built from.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', '..', 'src', 'modules');
let failed = 0;
for (const file of fs.readdirSync(dir).sort()) {
  if (!file.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(dir, file), 'utf8');
  try {
    new vm.Script(source, { filename: file });
  } catch (error) {
    failed++;
    console.log(`SYNTAX ERROR in ${file}: ${error.message}`);
    const line = Number((error.stack.match(/<anonymous>:(\d+)/) || [])[1]);
    if (line) {
      const lines = source.split('\n');
      for (let i = Math.max(0, line - 3); i < Math.min(lines.length, line + 2); i++) {
        console.log(`  ${i + 1}: ${lines[i]}`);
      }
    }
  }
}
console.log(failed ? `${failed} module(s) failed` : 'all modules parse OK');
