// node --test scripts/release/*.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bump } = require('./bump-app-version');

const config = 'module.exports = { expo: { version: "0.1.42", runtimeVersion: "1.0.0", android: { versionCode: 43 } } };';

test('a new version bumps versionCode by one', () => {
  const r = bump(config, '0.1.43');
  assert.equal(r.versionCode, 44);
  assert.equal(r.changed, true);
  assert.match(r.source, /version: "0\.1\.43"/);
  assert.match(r.source, /versionCode: 44/);
  assert.match(r.source, /runtimeVersion: "1\.0\.0"/, 'other version-like keys are untouched');
});

test('re-running the same version keeps the code (a retried build burns nothing)', () => {
  const once = bump(config, '0.1.43').source;
  const again = bump(once, '0.1.43');
  assert.equal(again.changed, false);
  assert.equal(again.versionCode, 44);
});

test('older versions, bad versions and unfamiliar files are refused', () => {
  assert.throws(() => bump(config, '0.1.41'), /older/);
  assert.throws(() => bump(config, '0.1'), /not x\.y\.z/);
  assert.throws(() => bump('module.exports = {}', '0.1.43'), /needs a `version/);
});
