#!/usr/bin/env bash
# Undercut Amazon Appstore build — the uc-amazon release target (F-049).
#
# Same shape as build-uc-aab.sh, with EXPO_PUBLIC_STORE=amazon for both the
# prebuild (app.config.js drops the Google sign-in native module) and the
# gradle run (Metro inlines the flag, so the JS takes the Amazon sign-in path).
# Produces an APK (Amazon does not take AABs). UC_SKIP_PUBLISH=1 builds and
# verifies without copying.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${AIDLC_RELEASE_VERSION:?run through: aidlc run --tier release --unit undercut --version X.Y.Z}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export EXPO_PUBLIC_STORE=amazon

[ -f "$ROOT/google-services.json" ] || { echo "google-services.json missing at the repo root (untracked; copy it from the share)" >&2; exit 6; }
[ -f "$ROOT/undercut-release.keystore" ] || { echo "undercut-release.keystore missing at the repo root" >&2; exit 6; }
if [ -z "${UC_KEYSTORE_PASSWORD:-}" ] && [ ! -f "$ROOT/.signing.env" ]; then
  echo "no UC_KEYSTORE_PASSWORD in the environment and no .signing.env at the repo root" >&2; exit 6
fi

# Idempotent: uc-android may already have stamped this version.
# Store builds must never carry the demo-mode entry (verification builds only).
if [ "${EXPO_PUBLIC_ALLOW_DEMO:-}" = 1 ]; then
  echo "EXPO_PUBLIC_ALLOW_DEMO=1 is set — refusing to make a store build with the demo entry enabled" >&2; exit 7
fi

VC=$(node "$ROOT/scripts/release/bump-app-version.js" "$ROOT/app.config.js" "$VERSION")

cd "$ROOT"
npx expo prebuild --platform android --clean --no-install

# What EXPO_PUBLIC_STORE=amazon actually changes about Google Sign-In, stated plainly because the
# first version of this check got it wrong: it drops the google-signin *config plugin*, whose only
# Android effect is to apply the com.google.gms.google-services gradle plugin. The native module
# itself is autolinked from package.json and is in both APKs either way, and the Google pill is
# hidden at runtime by isAmazonBuild, not by the build.
#
# The check that was here grepped android/settings.gradle for "google-signin". Under SDK 55 that
# file never names individual packages — autolinking is a command run at configure time — so the
# grep could not match on any build, Amazon or Play, and had been passing vacuously since it was
# written. It read like proof and was not, which is worse than no check at all.
#
# These two lines are the real difference, and they are present in a Play prebuild.
if grep -q "com.google.gms.google-services" android/app/build.gradle || grep -q "com.google.gms:google-services" android/build.gradle; then
  echo "Amazon prebuild still applies the google-services gradle plugin — EXPO_PUBLIC_STORE=amazon did not reach app.config.js" >&2
  exit 5
fi
# The Amazon Appstore needs the Amazon flavour of the billing library and the matching gradle
# flavour. Getting this wrong produces a build that installs, runs, and cannot sell anything, so it
# is asserted rather than trusted: the plugin option is nested (modules.amazon.fireOS) and a typo in
# it fails silently.
if ! grep -q '^fireOsEnabled=true' android/gradle.properties; then
  echo "Amazon prebuild did not enable the Fire OS billing flavour — check the expo-iap plugin options in app.config.js" >&2
  exit 5
fi
if ! grep -q 'openiap-google-amazon' android/app/build.gradle; then
  echo "Amazon prebuild linked the Play billing library instead of the Amazon one" >&2
  exit 5
fi
if ! grep -q 'missingDimensionStrategy "platform", "amazon"' android/app/build.gradle; then
  echo "Amazon prebuild left the gradle platform flavour on play" >&2
  exit 5
fi
# R8 renamed Amazon's reflection-driven "Kiwi" classes and 2.4.0 force-closed on launch; Amazon
# rejected it. The keep rules live in app.config.js behind the same EXPO_PUBLIC_STORE switch as the
# billing flavour, so an unset env would drop them and bring the crash straight back. Assert they
# reached the file gradle actually reads.
if ! grep -q 'com.amazon' android/app/proguard-rules.pro; then
  echo "Amazon prebuild did not write the com.amazon keep rules into android/app/proguard-rules.pro — R8 will rename Amazon's SDK and the app will force-close on launch" >&2
  exit 5
fi

printf '\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m\n' >> android/gradle.properties
FONTS=$(ls android/app/src/main/assets/fonts/*.ttf 2>/dev/null | wc -l)
if [ "$FONTS" -lt 5 ]; then
  echo "expected 5 embedded font files in android/app/src/main/assets/fonts, found $FONTS (check the expo-font plugin in app.config.js)" >&2
  exit 5
fi

(cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease --console=plain)

APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
APKSIGNER=$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)
# APKs carry only the v2/v3 signature block, which keytool cannot read.
if ! "$APKSIGNER" verify --print-certs "$APK" | grep -q "O=Undercut"; then
  echo "APK is not signed with the Undercut key (check plugins/withReleaseSigning and the signing env)" >&2
  exit 3
fi
BUNDLE=$(unzip -p "$APK" assets/index.android.bundle | strings || true)
ROUTES=$(grep -o '\./[A-Za-z()_/.-]*\.tsx' <<<"$BUNDLE" | sort -u || true)
if ! grep -q '(simple)/index\.tsx' <<<"$ROUTES" || grep -q '(tabs)/garage\.tsx' <<<"$ROUTES"; then
  echo "APK's JS bundle is not Undercut's (expected (simple)/index.tsx, no Track Limits routes) — check metro.config.js" >&2
  exit 4
fi
if ! grep -q 'signInWithAmazon' <<<"$BUNDLE"; then
  echo "APK's JS bundle has no Amazon sign-in path — EXPO_PUBLIC_STORE=amazon did not reach the Metro bundle" >&2
  exit 4
fi

NAME="undercut-$VERSION-vc$VC-amazon.apk"
if [ "${UC_SKIP_PUBLISH:-}" = 1 ]; then
  echo "built $NAME at $APK (signed O=Undercut, Undercut bundle, Amazon variant); UC_SKIP_PUBLISH=1, not copied"
  exit 0
fi

cp "$APK" "/mnt/smb/share/undercut/$NAME"
if ! scp -q -o BatchMode=yes "$APK" "natha@10.0.25.60:Downloads/$NAME"; then
  echo "warning: could not copy to the Windows upload box; $NAME is on the share" >&2
fi
echo "built $NAME (signed O=Undercut, Undercut bundle, Amazon variant)"
