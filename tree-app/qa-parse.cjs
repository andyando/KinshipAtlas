'use strict';
// Locate the exact syntax error, with a binary search on trimmed prefixes so
// the reported line is the real first failure the parser sees.
const fs = require('fs');
const vm = require('vm');
let src = fs.readFileSync('app.js', 'utf8').replace(/\r\n/g, '\n');

function tryParse(text) {
  try { new vm.Script(text); return null; } catch (e) { return e; }
}

let err = tryParse(src);
if (!err) { console.log('parses OK'); process.exit(0); }
console.log('first error:', err.message.slice(0, 160));

// Walk backwards from the end until we find the smallest failing prefix, then
// report the last complete statement's line so the culprit line shows up.
const lines = src.split('\n');
let lo = 1, hi = lines.length;
// A binary search assumes a monotone failure; suffix errors are not monotone.
// Instead: report context of the deepest unclosed construct using vm.compileFunction messages.
try {
  new vm.Script(src, { filename: 'app.js' });
} catch (e) {
  const stackLines = (e.stack || '').split('\n');
  for (const l of stackLines.slice(0, 6)) console.log(l);
}
