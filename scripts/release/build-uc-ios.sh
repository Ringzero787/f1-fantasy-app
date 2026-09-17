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
BUILD=$(node "$ROOT/scripts/release/bump-app-version.js" "$ROOT/app.config.js" "$VERSION" --ios)

cd "$ROOT"
# node_modules, android/ and ios/ are the Mac's own; --delete keeps the rest in
# lockstep with this checkout. Untracked GoogleService-Info.plist rides along.
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude android --exclude ios --exclude newgame \
  --exclude functions/lib --exclude functions/node_modules --exclude .aidlc/tmp --exclude .aidlc/runs \
  --exclude android-bundle --exclude .expo --exclude build \
  ./ "$MAC:$MAC_DIR/"

ssh -o BatchMode=yes -o ServerAliveInterval=30 "$MAC" \
  "UC_VERSION='$VERSION' UC_BUILD='$BUILD' UC_SKIP_PUBLISH='${UC_SKIP_PUBLISH:-}' bash ~/$MAC_DIR/scripts/release/mac/uc-ios-archive.sh"

NAME="undercut-$VERSION-build$BUILD.ipa"
if [ "${UC_SKIP_PUBLISH:-}" = 1 ]; then
  echo "archived and exported $NAME on the Mac ($MAC:$MAC_DIR/build/export/Undercut.ipa); UC_SKIP_PUBLISH=1, not uploaded or copied"
  exit 0
fi
mkdir -p "$ROOT/.aidlc/tmp/undercut-ios"
scp -q -o BatchMode=yes "$MAC:$MAC_DIR/build/export/Undercut.ipa" "$ROOT/.aidlc/tmp/undercut-ios/$NAME"
cp "$ROOT/.aidlc/tmp/undercut-ios/$NAME" "/mnt/smb/share/undercut/$NAME"
echo "uploaded $NAME to App Store Connect (submit it for review there); copy on the share"
