'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'face-scan.js'), 'utf8');

test('URL-backed launcher media is decoded from its served URL instead of an empty File blob', async () => {
  const calls = [];
  let loadedImage = null;
  class FakeImage {
    set src(value) {
      calls.push(['src', value]);
      this.naturalWidth = 100;
      this.naturalHeight = 100;
      queueMicrotask(() => this.onload());
    }
  }
  const context = vm.createContext({
    window: {},
    document: {},
    Image: FakeImage,
    URL: {
      createObjectURL: () => {
        calls.push(['createObjectURL']);
        return 'blob:unexpected';
      },
      revokeObjectURL: () => calls.push(['revokeObjectURL'])
    },
    Error,
    Promise,
    Math
  });
  vm.runInContext(source, context);
  const scanner = context.window.KinshipFaceScan;
  const file = { name: 'portrait.jpg', size: 0, kinshipUrl: 'Primary%20Media%20Library/photo.jpg' };
  const originalAnalyse = scanner.analyse;
  await assert.rejects(() => originalAnalyse(file), /model|runtime/i);
  assert.deepEqual(calls.filter(([name]) => name === 'src'), [['src', file.kinshipUrl]]);
  assert.equal(calls.some(([name]) => name === 'createObjectURL'), false);
});
