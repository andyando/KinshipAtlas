'use strict';
// Find unmatched brackets, skipping strings / comments, and print file:line.
const fs = require('fs');
const t = fs.readFileSync('app.js', 'utf8').replace(/\r\n/g, '\n');
let depth = 0, line = 1;
const stack = [];
let inSingle = false, inDouble = false, inTemplate = false, inLineComment = false, inBlockComment = false;
let prev = '';
for (let i = 0; i < t.length; i += 1) {
  const ch = t[i];
  const next = t[i + 1];
  if (inLineComment) { if (ch === '\n') { inLineComment = false; line += 1; prev = ''; } continue; }
  if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; prev = ch; i += 1; continue; } if (ch === '\n') line += 1; continue; }
  if (inTemplate) {
    if (ch === '`') { inTemplate = false; prev = ch; continue; }
    if (ch === '\\') { prev = ch; i += 1; continue; }
    if (ch === '\n') line += 1;
    prev = ch; continue;
  }
  if (inSingle) { if (ch === '\\') { prev = ch; i += 1; continue; } if (ch === "'" || ch === '\n') inSingle = false; prev = ch; continue; }
  if (inDouble) { if (ch === '\\') { prev = ch; i += 1; continue; } if (ch === '"' || ch === '\n') inDouble = false; prev = ch; continue; }
  if (ch === '/' && next === '/') { inLineComment = true; continue; }
  if (ch === '/' && next === '*') { inBlockComment = true; i += 1; continue; }
  if (ch === "'") { inSingle = true; prev = ch; continue; }
  if (ch === '"') { inDouble = true; prev = ch; continue; }
  if (ch === '`') { inTemplate = true; prev = ch; continue; }
  if (ch === '\n') { line += 1; prev = ''; continue; }
  if ('([{'.includes(ch)) { depth += 1; stack.push({ ch, line }); prev = ch; continue; }
  if (')]}'.includes(ch)) {
    depth -= 1;
    const open = stack.pop();
    if (open) {
      const pairs = { '(': ')', '[': ']', '{': '}' };
      if (pairs[open.ch] !== ch) console.log(`mismatch: ${open.ch} at ${open.line} closed by ${ch} at ${line}`);
    } else {
      console.log(`extra closer ${ch} at line ${line}`);
      depth = 0;
    }
    prev = ch; continue;
  }
  prev = ch;
}
console.log('depth at EOF:', depth);
for (const open of stack) console.log(`unclosed ${open.ch} opened at line ${open.line}`);
