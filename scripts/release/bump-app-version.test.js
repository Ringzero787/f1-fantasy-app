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

test('an ios buildNumber moves with the version and holds on a re-run', () => {
  const src = 'export default { version: "2.2.3", ios: { buildNumber: "37" }, android: { versionCode: 54 } }';
  const once = bump(src, '2.2.4');
  assert.equal(once.versionCode, 55);
  assert.equal(once.buildNumber, 38);
  assert.match(once.source, /buildNumber: "38"/);
  const again = bump(once.source, '2.2.4');
  assert.equal(again.changed, false);
  assert.equal(again.buildNumber, 38);
  // Track Limits has no iOS block: buildNumber is simply absent.
  assert.equal(bump('version: "0.1.0", versionCode: 1', '0.1.1').buildNumber, null);
});
