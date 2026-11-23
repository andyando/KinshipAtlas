const { spawn } = require('node:child_process');
const fs = require('node:fs');

const output = 'G:\\Git\\Kinship_Experimental\\tree-app\\tools\\artifacts\\qa-four.log';
const browser = spawn(process.execPath, [
  'C:\\Users\\agand\\.codegpt\\skills\\browser-automation\\browser.mjs',
  'http://127.0.0.1:8811/',
  '--script', 'G:\\Git\\Kinship_Experimental\\tree-app\\tools\\qa-four-items.mjs',
  '--timeout', '360000'
], { windowsHide: true });
let text = '';
browser.stdout.on('data', (data) => { text += data; });
browser.stderr.on('data', (data) => { text += data; });
browser.on('close', (code) => fs.writeFileSync(output, `exit ${code}\n${text}`));
