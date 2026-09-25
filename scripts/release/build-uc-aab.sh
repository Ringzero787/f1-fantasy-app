#!/usr/bin/env bash
# Undercut Android store build — the uc-android release target (F-048).
#
# Run through the release unit:
#   aidlc run --tier release --unit undercut --version X.Y.Z
# which exports AIDLC_RELEASE_VERSION. Mirrors scripts/release/build-tl-aab.sh:
# bump app.config.js, prebuild clean (plugins/withReleaseSigning re-injects
# the release keystore that --clean wipes), gradle bundleRelease, verify the
# signature and the JS bundle, then copy the AAB to the share and the Windows
# upload box. Set UC_SKIP_PUBLISH=1 to build and verify without copying.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${AIDLC_RELEASE_VERSION:?run through: aidlc run --tier release --unit undercut --version X.Y.Z}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"

# Untracked inputs prebuild needs (both owner-only, never committed): the
# Firebase Android config and the keystore password source.
[ -f "$ROOT/google-services.json" ] || { echo "google-services.json missing at the repo root (untracked; copy it from the share)" >&2; exit 6; }
[ -f "$ROOT/undercut-release.keystore" ] || { echo "undercut-release.keystore missing at the repo root" >&2; exit 6; }
if [ -z "${UC_KEYSTORE_PASSWORD:-}" ] && [ ! -f "$ROOT/.signing.env" ]; then
  echo "no UC_KEYSTORE_PASSWORD in the environment and no .signing.env at the repo root" >&2; exit 6
fi

# Store builds must never carry the demo-mode entry (verification builds only).
if [ "${EXPO_PUBLIC_ALLOW_DEMO:-}" = 1 ]; then
  echo "EXPO_PUBLIC_ALLOW_DEMO=1 is set — refusing to make a store build with the demo entry enabled" >&2; exit 7
fi

VC=$(node "$ROOT/scripts/release/bump-app-version.js" "$ROOT/app.config.js" "$VERSION")

cd "$ROOT"
npx expo prebuild --platform android --clean --no-install

# Release builds OOM in lintVital (see reference in the repo memory); lint is
# not needed for the artifact — app code is typechecked separately.
# printf with a leading newline: the generated file has no trailing newline
# (expo-build-properties writes android.buildToolsVersion last), so a bare
# echo >> would glue this onto that value and break the build.
# And the reverse of the Amazon build's check: a Play build must carry the Play billing flavour.
if grep -q '^fireOsEnabled=true' android/gradle.properties || grep -q 'openiap-google-amazon' android/app/build.gradle; then
  echo "this prebuild carries the Amazon billing flavour — EXPO_PUBLIC_STORE is set to amazon" >&2
  exit 5
fi

printf '\norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m\n' >> android/gradle.properties

# The Grid faces must be embedded natively: expo-font's runtime asset
# loading fails in release builds. The expo-font plugin in app.config.js puts
# them here at prebuild; fail loudly if that ever stops happening.
FONTS=$(ls android/app/src/main/assets/fonts/*.ttf 2>/dev/null | wc -l)
if [ "$FONTS" -lt 5 ]; then
  echo "expected 5 embedded font files in android/app/src/main/assets/fonts, found $FONTS (check the expo-font plugin in app.config.js)" >&2
  exit 5
fi

(cd android && ./gradlew bundleRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease --console=plain)

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"

if ! keytool -printcert -jarfile "$AAB" | grep -q "O=Undercut"; then
  echo "AAB is not signed with the Undercut key (check plugins/withReleaseSigning and the signing env)" >&2
  exit 3
fi

ROUTES=$(unzip -p "$AAB" base/assets/index.android.bundle | strings | grep -o '\./[A-Za-z()_/.-]*\.tsx' | sort -u || true)
if ! grep -q '(simple)/index\.tsx' <<<"$ROUTES" || grep -q '(tabs)/garage\.tsx' <<<"$ROUTES"; then
  echo "AAB's JS bundle is not Undercut's (expected (simple)/index.tsx, no Track Limits routes) — check metro.config.js" >&2
  exit 4
fi

NAME="undercut-$VERSION-vc$VC.aab"
if [ "${UC_SKIP_PUBLISH:-}" = 1 ]; then
  echo "built $NAME at $AAB (signed O=Undercut, Undercut bundle); UC_SKIP_PUBLISH=1, not copied"
  exit 0
fi

cp "$AAB" "/mnt/smb/share/undercut/$NAME"
if ! scp -q -o BatchMode=yes "$AAB" "natha@10.0.25.60:Downloads/$NAME"; then
  echo "warning: could not copy to the Windows upload box; $NAME is on the share" >&2
fi
echo "built $NAME (signed O=Undercut, Undercut bundle)"
