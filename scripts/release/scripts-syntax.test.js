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

test('the Amazon build does not carry a store-switch assertion that cannot fail', () => {
  // Three attempts at one have been wrong, each looking like proof:
  //   1. grep google-signin android/settings.gradle — that file names no autolinked packages under
  //      SDK 55, so it matched on no build at all.
  //   2. grep com.google.gms.google-services in the gradle files — Expo's default prebuild chain
  //      emits those whenever android.googleServicesFile is set, which app.config.js does
  //      unconditionally, so it matched on every build including correct Amazon ones.
  //   3. grep signInWithAmazon in the JS bundle — app/(auth)/login.tsx names that callable
  //      unconditionally, so it is in the Play bundle too.
  // On Android the store switch changes nothing about Google Sign-In in the artifact. What it does
  // change is what Metro inlines, and Metro runs in the gradle step — a different process from the
  // prebuild — so that is where the flag is checked.
  const src = fs.readFileSync(path.join(here, 'build-uc-apk-amazon.sh'), 'utf8');
  // Comments stripped: the note in the script names all three dead checks on purpose, and matching
  // prose would make this test fail on its own explanation.
  const code = src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.ok(!/grep[^\n]*google-signin[^\n]*settings\.gradle/.test(code), 'settings.gradle cannot name autolinked packages');
  assert.ok(!/grep -q "com\.google\.gms/.test(code), 'both google-services lines are in an Amazon prebuild too; this fails every Amazon build');
  assert.ok(!/grep -q 'signInWithAmazon'/.test(code), 'signInWithAmazon is in the Play bundle too');
  // And the one that can fail: the flag is verified and passed explicitly at the gradle call, not
  // inherited and hoped for.
  assert.match(src, /\[ "\$\{EXPO_PUBLIC_STORE:-\}" = amazon \]/, 'assert the flag at the step where Metro reads it');
  assert.match(src, /EXPO_PUBLIC_STORE=amazon \.\/gradlew assembleRelease/, 'pass it explicitly to gradle');
});

test('the Mac script never puts the provisioning profile on the xcodebuild command line', () => {
  const src = fs.readFileSync(path.join(here, 'mac/uc-ios-archive.sh'), 'utf8');
  const archiveLine = src.split('\n').filter((l) => l.includes('archive ') && l.includes('xcodebuild')).join(' ');
  assert.ok(!/PROVISIONING_PROFILE_SPECIFIER/.test(archiveLine), 'profile must be set in the pbxproj, not passed to every Pods target');
  assert.match(src, /trap cleanup EXIT/);
});
