'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const appDir = path.join(__dirname, '..');

test('local helpers stay available for explicitly opened browser sessions', () => {
  const nodeHelper = fs.readFileSync(path.join(appDir, 'server.js'), 'utf8');
  const launcher = fs.readFileSync(path.join(appDir, 'launcher', 'KinshipAtlas.cs'), 'utf8');

  assert.doesNotMatch(nodeHelper, /idleShutdown|No browser activity/);
  assert.doesNotMatch(launcher, /lastRequest|stops? pinging|TimeSpan\.FromMinutes\(2\)/);
  assert.match(nodeHelper, /url\.pathname === '\/api\/exit'/);
  assert.match(launcher, /path == "\/api\/exit"/);
});

test('exit can proceed explicitly when preference flushing is unavailable', () => {
  const app = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');

  assert.match(app, /could not be saved to the local selections file\. Exit anyway\?/);
  assert.doesNotMatch(app, /clearInterval\(mediaHeartbeat\)/);
});
