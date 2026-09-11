// withReleaseSigning — Expo config plugin that injects the Track Limits release
// signing config into android/app/build.gradle after `expo prebuild`
// regenerates the native project. Without this, every prebuild wipes the
// signing config and the next release build is signed with debug.keystore
// (and Play Console rejects the upload).
//
// The keystore password is not in this public repo. It comes from
// TL_KEYSTORE_PASSWORD in the environment, or from the untracked, owner-only
// .signing.env at the repo root (KEY=VALUE lines, parsed, never shell-sourced).
// It is read only inside the build.gradle mod, i.e. during an Android prebuild:
// `expo export` / `expo config` (CI) evaluate this plugin without needing it.
// Keystore details: newgame/KEYSTORE.md (untracked).

const fs = require('fs');
const path = require('path');
const { withAppBuildGradle } = require('@expo/config-plugins');

const KEYSTORE_FILE = '../../tracklimits-release.keystore';
const KEYSTORE_ALIAS = 'tracklimits';
const SIGNING_ENV = path.resolve(__dirname, '..', '..', '.signing.env');

function readSigningEnv(file = SIGNING_ENV) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

function keystorePassword(env = process.env, file = SIGNING_ENV) {
  const pw = env.TL_KEYSTORE_PASSWORD || readSigningEnv(file).TL_KEYSTORE_PASSWORD;
  if (!pw) throw new Error(`withReleaseSigning: no TL_KEYSTORE_PASSWORD — set it in the environment or in ${file} (see newgame/KEYSTORE.md)`);
  // It lands inside a single-quoted Groovy string in build.gradle.
  if (/['\\\n]/.test(pw)) throw new Error('withReleaseSigning: the keystore password cannot contain quotes, backslashes or newlines');
  return pw;
}

const signingBlock = (pw) => `
        release {
            storeFile file('${KEYSTORE_FILE}')
            storePassword '${pw}'
            keyAlias '${KEYSTORE_ALIAS}'
            keyPassword '${pw}'
        }`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    // 1. Inject the release signing block as a sibling of `debug` inside
    //    signingConfigs { … }. We anchor on the standard-generated debug block
    //    and append after its closing `}` (4-space indent) rather than trying
    //    to do balanced-brace matching in regex.
    //    Guard on the keystore filename (uniquely ours) — the previous guard
    //    `signingConfigs {…release {` falsely matched the buildTypes.release
    //    block that always appears later in the file, so the signing block was
    //    never injected and `buildTypes.release` referenced a missing config.
    if (!src.includes(KEYSTORE_FILE)) {
      src = src.replace(
        /(signingConfigs\s*\{[\s\S]*?\bdebug\s*\{[\s\S]*?\n        \})/,
        `$1${signingBlock(keystorePassword())}`,
      );
    }

    // 2. Switch buildTypes.release to use signingConfigs.release instead of debug.
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+)signingConfigs\.debug/,
      '$1signingConfigs.release',
    );

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = withReleaseSigning;
module.exports.keystorePassword = keystorePassword;
module.exports.readSigningEnv = readSigningEnv;
