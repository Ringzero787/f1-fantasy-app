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

if grep -q "google-signin" android/settings.gradle; then
  echo "Amazon prebuild still links @react-native-google-signin — EXPO_PUBLIC_STORE=amazon did not reach app.config.js" >&2
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
