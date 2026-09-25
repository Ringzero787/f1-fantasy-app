// withReleaseSigning — Expo config plugin that injects the Undercut release
// signing config into android/app/build.gradle after `expo prebuild`
// regenerates the native project. Without this, every prebuild wipes the
// signing config and the next release build is signed with debug.keystore
// (and Play Console rejects the upload).
//
// The keystore password is not in this public repo. It comes from
// UC_KEYSTORE_PASSWORD in the environment, or from the untracked, owner-only
// .signing.env at the repo root (KEY=VALUE lines, parsed, never shell-sourced).
// It is read only inside the build.gradle mod, i.e. during an Android prebuild:
// `expo export` / `expo config` (CI) evaluate this plugin without needing it.
// Keystore details: the root credentials.json (untracked).

const fs = require('fs');
const path = require('path');
const { withAppBuildGradle } = require('@expo/config-plugins');

const KEYSTORE_FILE = '../../undercut-release.keystore';
const KEYSTORE_ALIAS = 'undercut';
const SIGNING_ENV = path.resolve(__dirname, '..', '.signing.env');

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
  const pw = env.UC_KEYSTORE_PASSWORD || readSigningEnv(file).UC_KEYSTORE_PASSWORD;
  if (!pw) throw new Error(`withReleaseSigning: no UC_KEYSTORE_PASSWORD — set it in the environment or in ${file} (see credentials.json at the repo root)`);
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

/**
 * Pure string transform, so the mutation is testable without a prebuild.
 * Throws if the generated build.gradle does not look like the template this
 * anchors on: a silent no-op here means a debug-signed store build, which
 * Play rejects only after the upload.
 */
function injectReleaseSigning(src, pw) {
  let out = src;
  // 1. Inject the release signing block as a sibling of `debug` inside
  //    signingConfigs { … }. Anchor on the standard-generated debug block and
  //    append after its closing `}` (4-space indent) rather than balanced-brace
  //    matching. Guard on the keystore filename (uniquely ours) — a guard on
  //    `signingConfigs {…release {` falsely matched buildTypes.release.
  if (!out.includes(KEYSTORE_FILE)) {
    out = out.replace(
      /(signingConfigs\s*\{[\s\S]*?\bdebug\s*\{[\s\S]*?\n        \})/,
      `$1${signingBlock(pw)}`,
    );
    if (!out.includes(KEYSTORE_FILE)) {
      throw new Error('withReleaseSigning: could not find the generated signingConfigs.debug block to inject after — the Android template changed; update the anchor');
    }
  }
  // 2. Switch buildTypes.release to use signingConfigs.release instead of debug.
  //    Groovy accepts both the method-call form the Android template generates
  //    (`signingConfig signingConfigs.debug`) and the assignment form
  //    (`signingConfig = signingConfigs.debug`). expo-iap's plugin rewrites the
  //    generated file into the assignment form, so both are matched here and the
  //    operator is kept as it was found. This check must never be relaxed into a
  //    silent no-op: without it a store build would go out signed with the debug key.
  out = out.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s*(?:=\s*|\s))signingConfigs\.debug/,
    '$1signingConfigs.release',
  );
  if (!/buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s*(?:=\s*|\s)signingConfigs\.release/.test(out)) {
    throw new Error('withReleaseSigning: buildTypes.release still does not use signingConfigs.release — the Android template changed; update the anchor');
  }
  return out;
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectReleaseSigning(cfg.modResults.contents, keystorePassword());
    return cfg;
  });
}

module.exports = withReleaseSigning;
module.exports.keystorePassword = keystorePassword;
module.exports.readSigningEnv = readSigningEnv;
module.exports.injectReleaseSigning = injectReleaseSigning;
