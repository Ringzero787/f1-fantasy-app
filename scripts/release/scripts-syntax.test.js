// node --test scripts/release/*.test.js — every release script must at least parse,
// so a stray quote cannot surface only on release day.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const scripts = ['build-tl-aab.sh', 'build-uc-aab.sh', 'build-uc-apk-amazon.sh', 'build-uc-ios.sh', 'mac/uc-ios-archive.sh'];

for (const s of scripts) {
  test(`${s} parses`, () => {
    execFileSync('bash', ['-n', path.join(here, s)]);
  });
}

test('every uc-* script refuses to run without AIDLC_RELEASE_VERSION', () => {
  for (const s of ['build-uc-aab.sh', 'build-uc-apk-amazon.sh', 'build-uc-ios.sh']) {
    const src = fs.readFileSync(path.join(here, s), 'utf8');
    assert.match(src, /AIDLC_RELEASE_VERSION:\?/, s);
    assert.match(src, /bump-app-version\.js/, s);
  }
});

test('the Mac script never puts the provisioning profile on the xcodebuild command line', () => {
  const src = fs.readFileSync(path.join(here, 'mac/uc-ios-archive.sh'), 'utf8');
  const archiveLine = src.split('\n').filter((l) => l.includes('archive ') && l.includes('xcodebuild')).join(' ');
  assert.ok(!/PROVISIONING_PROFILE_SPECIFIER/.test(archiveLine), 'profile must be set in the pbxproj, not passed to every Pods target');
  assert.match(src, /trap cleanup EXIT/);
});
