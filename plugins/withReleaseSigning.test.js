// node --test plugins/*.test.js — where the release keystore password comes from.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { keystorePassword, readSigningEnv, injectReleaseSigning } = require('./withReleaseSigning');

const tmpEnv = (body) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'signing-')), '.signing.env');
  fs.writeFileSync(file, body);
  return file;
};
const missing = path.join(os.tmpdir(), 'no-such-dir', '.signing.env');

test('the environment wins over the file', () => {
  const file = tmpEnv('UC_KEYSTORE_PASSWORD=from-file\n');
  assert.equal(keystorePassword({ UC_KEYSTORE_PASSWORD: 'from-env' }, file), 'from-env');
});

test('the file is parsed as KEY=VALUE, comments skipped, values kept verbatim', () => {
  const file = tmpEnv('# comment\nTL_KEYSTORE_PASSWORD=zz+1\nUC_KEYSTORE_PASSWORD=ab+cd=ef\n');
  assert.equal(keystorePassword({}, file), 'ab+cd=ef');
  assert.equal(readSigningEnv(file).TL_KEYSTORE_PASSWORD, 'zz+1');
});

test('a missing password stops the prebuild with a pointer to where it goes', () => {
  assert.throws(() => keystorePassword({}, missing), /no UC_KEYSTORE_PASSWORD/);
});

test('a password that would break the Groovy string is refused', () => {
  assert.throws(() => keystorePassword({ UC_KEYSTORE_PASSWORD: "it's" }, missing), /cannot contain quotes/);
  assert.throws(() => keystorePassword({ UC_KEYSTORE_PASSWORD: 'a\\b' }, missing), /cannot contain quotes/);
});

// A slice of the build.gradle that `expo prebuild` generates (AGP 8 template).
const GENERATED = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            shrinkResources false
        }
    }
}
`;

test('injects the Undercut release signing block and points buildTypes.release at it', () => {
  const out = injectReleaseSigning(GENERATED, 'pw#1');
  assert.match(out, /signingConfigs \{[\s\S]*debug \{[\s\S]*\}\n        release \{\n            storeFile file\('\.\.\/\.\.\/undercut-release\.keystore'\)/);
  assert.match(out, /keyAlias 'undercut'/);
  assert.match(out, /storePassword 'pw#1'/);
  assert.match(out, /buildTypes \{[\s\S]*release \{\n            signingConfig signingConfigs\.release/);
  assert.match(out, /debug \{\n            signingConfig signingConfigs\.debug/); // debug build type untouched
});

test('is idempotent on a file that already carries the block', () => {
  const once = injectReleaseSigning(GENERATED, 'pw');
  assert.equal(injectReleaseSigning(once, 'pw'), once);
});

test('refuses to silently no-op when the template it anchors on is gone', () => {
  assert.throws(() => injectReleaseSigning('android {\n  buildTypes { release { signingConfig signingConfigs.debug } }\n}\n', 'pw'), /could not find the generated signingConfigs\.debug block/);
  const noRelease = GENERATED.replace(/release \{\n            signingConfig signingConfigs\.debug\n            shrinkResources false\n        \}\n/, '');
  assert.throws(() => injectReleaseSigning(noRelease, 'pw'), /buildTypes\.release still does not use/);
});

// expo-iap's config plugin rewrites the generated file into Groovy's assignment form. Before this
// was handled, a store build failed outright rather than shipping debug-signed, which is the right
// way round, but the build still has to work.
test('handles the assignment form another plugin can leave behind', () => {
  const assigned = GENERATED.replace(/signingConfig signingConfigs\.debug/g, 'signingConfig = signingConfigs.debug');
  const out = injectReleaseSigning(assigned, 'pw#1');
  assert.match(out, /release \{\n            signingConfig = signingConfigs\.release/);
  // the debug build type is left exactly as it was
  assert.match(out, /debug \{\n            signingConfig = signingConfigs\.debug/);
});

test('still refuses when there is no release signing config to switch', () => {
  const noRelease = GENERATED.replace(/    buildTypes \{[\s\S]*?\n    \}\n/, '    buildTypes {\n    }\n');
  assert.throws(() => injectReleaseSigning(noRelease, 'pw'), /does not use signingConfigs\.release/);
});
