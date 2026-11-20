const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('app.js', 'utf8');
try { new vm.Script(src); console.log('app.js parses'); } catch (e) { console.log('ERROR', e.message); const line = Number((e.stack.match(/app\.js:(\d+)/) || [])[1] || (e.stack.match(/evalmachine.*?:(\d+)/) || [])[1]); console.log('line', line); console.log(src.split('\n').slice(line - 4, line + 2).join('\n')); }
