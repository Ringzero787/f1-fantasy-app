#!/usr/bin/env bash
# Undercut iOS store build — the uc-ios release target (F-049).
#
# Runs from the Linux build box and drives the Mac Mini over SSH (alias
# `macmini`): sync the tree, then hand off to scripts/release/mac/uc-ios-archive.sh
# for the archive, export and App Store Connect upload. The IPA is copied back to
# the share as undercut-<ver>-build<n>.ipa. UC_SKIP_PUBLISH=1 archives, exports
# and verifies but does not upload or copy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${AIDLC_RELEASE_VERSION:?run through: aidlc run --tier release --unit undercut --version X.Y.Z}"
MAC="${UC_MAC_HOST:-macmini}"
MAC_DIR="${UC_MAC_DIR:-projects/f1-app}"

[ -f "$ROOT/GoogleService-Info.plist" ] || { echo "GoogleService-Info.plist missing at the repo root (untracked; copy it from the share)" >&2; exit 6; }
[ -f "$ROOT/google-services.json" ] || { echo "google-services.json missing at the repo root (untracked; copy it from the share)" >&2; exit 6; }
if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$MAC" 'true' 2>/dev/null; then
  echo "Mac Mini ($MAC) is not reachable over SSH — it is probably powered off (the sleep light looks like the power light)" >&2
  exit 7
fi
ssh -o BatchMode=yes "$MAC" 'test -f ~/ZP6VK29GWR.cer && test -f ~/ZP6VK29GWR.p12 && test -f ~/private_keys/AuthKey_84Y9W9865G.p8' \
  || { echo "signing material missing on the Mac: need ~/ZP6VK29GWR.cer, ~/ZP6VK29GWR.p12 and ~/private_keys/AuthKey_84Y9W9865G.p8" >&2; exit 6; }

# Idempotent: uc-android / uc-amazon may already have stamped this version.
# Store builds must never carry the demo-mode entry (verification builds only).
if [ "${EXPO_PUBLIC_ALLOW_DEMO:-}" = 1 ]; then
  echo "EXPO_PUBLIC_ALLOW_DEMO=1 is set — refusing to make a store build with the demo entry enabled" >&2; exit 7
fi

# The Firebase web config reaches the JS bundle only through the untracked .env, which the rsync
# below carries to the Mac (see build-uc-aab.sh: 2.7.0 shipped without it and crashed at launch).
if ! grep -qE '^EXPO_PUBLIC_FIREBASE_API_KEY=.+' "$ROOT/.env" 2>/dev/null; then
  echo ".env with EXPO_PUBLIC_FIREBASE_API_KEY missing at the repo root (untracked; copy it from the main checkout) — the bundle would ship without a Firebase config and crash at launch" >&2; exit 6
fi

BUILD=$(node "$ROOT/scripts/release/bump-app-version.js" "$ROOT/app.config.js" "$VERSION" --ios)

cd "$ROOT"
# node_modules, android/ and ios/ are the Mac's own; --delete keeps the rest in
# lockstep with this checkout. Untracked GoogleService-Info.plist rides along;
# the Android signing material (keystore, its password file, credentials.json)
# has no business on the Mac and is filtered out explicitly.
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude android --exclude ios --exclude newgame \
  --exclude functions/lib --exclude functions/node_modules --exclude .aidlc/tmp --exclude .aidlc/runs \
  --exclude android-bundle --exclude .expo --exclude build \
  --exclude '*.keystore' --exclude .signing.env --exclude credentials.json --exclude '*.p12' --exclude '*.pem' \
  ./ "$MAC:$MAC_DIR/"

ssh -o BatchMode=yes -o ServerAliveInterval=30 "$MAC" \
  "UC_VERSION='$VERSION' UC_BUILD='$BUILD' UC_SKIP_PUBLISH='${UC_SKIP_PUBLISH:-}' bash ~/$MAC_DIR/scripts/release/mac/uc-ios-archive.sh"

NAME="undercut-$VERSION-build$BUILD.ipa"
if [ "${UC_SKIP_PUBLISH:-}" = 1 ]; then
  echo "archived and exported $NAME on the Mac ($MAC:$MAC_DIR/build/export/Undercut.ipa); UC_SKIP_PUBLISH=1, not uploaded or copied"
  exit 0
fi
mkdir -p "$ROOT/.aidlc/tmp/undercut-ios"
# Keep only this release's IPA here: G04/G08 size the artifact by globbing this folder,
# and a leftover from the previous version doubled the measured iOS size.
find "$ROOT/.aidlc/tmp/undercut-ios" -maxdepth 1 -name '*.ipa' ! -name "$NAME" -delete 2>/dev/null || true
scp -q -o BatchMode=yes "$MAC:$MAC_DIR/build/export/Undercut.ipa" "$ROOT/.aidlc/tmp/undercut-ios/$NAME"
# Same bundle check as the Android targets: a Firebase web API key ("AIza…") must be in main.jsbundle.
# The upload has already happened by now; a failure here is a loud stop before anything is submitted.
JSB=$(unzip -Z1 "$ROOT/.aidlc/tmp/undercut-ios/$NAME" | grep -m1 '\.app/main\.jsbundle$' || true)
KEYS=$(( $(unzip -p "$ROOT/.aidlc/tmp/undercut-ios/$NAME" "$JSB" | strings -n 8 | grep -c 'AIza' || true) + $(unzip -p "$ROOT/.aidlc/tmp/undercut-ios/$NAME" "$JSB" | strings -n 8 -e l | grep -c 'AIza' || true) ))
if [ "$KEYS" -lt 1 ]; then
  echo "IPA's main.jsbundle carries no Firebase web API key — this build would crash at launch (auth/invalid-api-key); do not submit it" >&2
  exit 4
fi
cp "$ROOT/.aidlc/tmp/undercut-ios/$NAME" "/mnt/smb/share/undercut/$NAME"
echo "uploaded $NAME to App Store Connect (submit it for review there); copy on the share"
