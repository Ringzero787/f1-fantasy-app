// withReleaseSigning — Expo config plugin that injects the Track Limits
// release signing config + versionCode/versionName into android/app/build.gradle
// after `expo prebuild` regenerates the native project. Without this, every
// prebuild wipes the signing config and the next release build is signed with
// debug.keystore (and Play Console rejects the upload).
//
// Keystore details mirror /data/f1-app/newgame/KEYSTORE.md.

const { withAppBuildGradle } = require('@expo/config-plugins');

const KEYSTORE_FILE = '../../tracklimits-release.keystore';
const KEYSTORE_ALIAS = 'tracklimits';
const KEYSTORE_PASSWORD = 'Fn1hbkSfcIXimxsrPRIn+pueV80E';

const RELEASE_SIGNING_BLOCK = `
        release {
            storeFile file('${KEYSTORE_FILE}')
            storePassword '${KEYSTORE_PASSWORD}'
            keyAlias '${KEYSTORE_ALIAS}'
            keyPassword '${KEYSTORE_PASSWORD}'
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;

    // 1. Inject the release signing block as a sibling of `debug` inside
    //    signingConfigs { … }. We anchor on the standard-generated debug block
    //    and append after its closing `}` (4-space indent) rather than trying
    //    to do balanced-brace matching in regex.
    if (!/signingConfigs\s*\{[\s\S]*?\brelease\s*\{/.test(src)) {
      src = src.replace(
        /(signingConfigs\s*\{[\s\S]*?\bdebug\s*\{[\s\S]*?\n        \})/,
        `$1${RELEASE_SIGNING_BLOCK}`,
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
};
