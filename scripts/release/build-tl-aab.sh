#!/usr/bin/env bash
# Track Limits release AAB, built locally on the Linux build box (never EAS) —
# the tl-android release target. `aidlc run --tier release --unit tracklimits
# --version X.Y.Z` runs it from G04 with AIDLC_RELEASE_VERSION set.
#
#  1. Stamp the version and the next versionCode into newgame/app.config.js.
#  2. expo prebuild (android/ is generated; plugins/withReleaseSigning injects
#     the release signing config), then gradle bundleRelease without the
#     lintVital pass, which runs out of metaspace and is not needed.
#  3. Check the AAB is signed with the Track Limits key (CN=TrackLimits, not
#     debug) and that its JS bundle is Track Limits' own: vc28 shipped
#     Undercut's JS inside the Track Limits shell and crashed on open.
#  4. Copy it to the SMB share and the Windows box used for Play uploads.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TL="$ROOT/newgame"
VERSION="${AIDLC_RELEASE_VERSION:?run through: aidlc run --tier release --unit tracklimits --version X.Y.Z}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"

VC=$(node "$ROOT/scripts/release/bump-app-version.js" "$TL/app.config.js" "$VERSION")

cd "$TL"
npx expo prebuild --platform android --clean --no-install
echo 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m' >> android/gradle.properties
(cd android && ./gradlew bundleRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease --console=plain)
AAB="$TL/android/app/build/outputs/bundle/release/app-release.aab"

if ! keytool -printcert -jarfile "$AAB" | grep -q "CN=TrackLimits"; then
  echo "AAB is not signed with the Track Limits key (check plugins/withReleaseSigning and the signing env)" >&2
  exit 3
fi
ROUTES=$(unzip -p "$AAB" base/assets/index.android.bundle | strings | grep -o '\./[A-Za-z()_/.-]*\.tsx' | sort -u || true)
if ! grep -q '(tabs)/garage\.tsx' <<<"$ROUTES" || grep -qE 'my-team\.tsx|\(simple\)' <<<"$ROUTES"; then
  echo "AAB's JS bundle is not Track Limits' (expected (tabs)/garage.tsx, no Undercut routes) — check newgame/metro.config.js" >&2
  exit 4
fi

NAME="tracklimits-$VERSION-vc$VC.aab"
if [ "${TL_SKIP_PUBLISH:-}" = 1 ]; then
  echo "built $NAME at $AAB (signed CN=TrackLimits, Track Limits bundle); TL_SKIP_PUBLISH=1, not copied"
  exit 0
fi
cp "$AAB" "/mnt/smb/share/tracklimits/$NAME"
if ! scp -q -o BatchMode=yes "$AAB" "natha@10.0.25.60:Downloads/$NAME"; then
  echo "warning: could not copy to the Windows upload box; $NAME is on the share" >&2
fi
echo "built $NAME (signed CN=TrackLimits, Track Limits bundle)"
