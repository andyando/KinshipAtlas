'use strict';
// Ask the real parser where the syntax error is, then map byte offset to line.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('app.js', 'utf8');
try {
  new vm.Script(src, { filename: 'app.js' });
  console.log('parses OK');
} catch (error) {
  console.log(error.message);
  const match = /:(\d+)/.exec(error.stack || '');
  if (match) {
    const line = Number(match[1]);
    const lines = src.split('\n');
    for (let i = Math.max(0, line - 4); i <= Math.min(lines.length - 1, line + 2); i += 1) {
      console.log(`${i + 1}${i + 1 === line ? ' <<<' : '    '} ${lines[i]}`);
    }
  }
}
