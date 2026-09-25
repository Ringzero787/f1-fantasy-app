#!/usr/bin/env bash
# Mac Mini side of the uc-ios release target (F-049). Invoked over SSH by
# scripts/release/build-uc-ios.sh with UC_VERSION, UC_BUILD and UC_SKIP_PUBLISH.
#
# Why it looks the way it does: the login keychain is not usable from an SSH
# session, so codesign fails inside "[CP] Embed Pods Frameworks" under
# automatic signing. We build a throwaway keychain holding only the Apple
# Distribution identity and sign the APP TARGET manually against the App Store
# profile. The profile must not go on the xcodebuild command line — every
# CocoaPods target would then refuse it.
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH LANG=en_US.UTF-8

: "${UC_VERSION:?}" "${UC_BUILD:?}"
DIR="$HOME/${UC_MAC_DIR:-projects/f1-app}"
TEAM="${UC_APPLE_TEAM:-MWVD9BU5VW}"
PROFILE="${UC_IOS_PROFILE:-Undercut AppStore Distribution}"
BUNDLE_ID="${UC_IOS_BUNDLE_ID:-com.undercut.app}"
KEY_ID="${UC_ASC_KEY_ID:-84Y9W9865G}"
ISSUER="${UC_ASC_ISSUER:-3eda16c0-c433-4d59-bd7e-1d88d02017f7}"
# Throwaway keychain: private dir under $HOME (not /tmp), random name and
# password, deleted on exit. The distribution private key lives in it only
# for the length of the build.
KC_DIR=$(mktemp -d "$HOME/.uc-build-keychain.XXXXXX")
chmod 700 "$KC_DIR"
KC="$KC_DIR/build.keychain"
KC_PW=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
ORIG_KEYCHAINS=$(security list-keychains -d user | tr -d '"' | tr -d ' ')

cleanup() {
  # Restore the search list exactly as it was, then drop the keychain and its dir.
  # shellcheck disable=SC2086
  security list-keychains -d user -s $ORIG_KEYCHAINS >/dev/null 2>&1 || true
  security delete-keychain "$KC" >/dev/null 2>&1 || true
  rm -rf "$KC_DIR"
}
trap cleanup EXIT

cd "$DIR"
rm -rf build && mkdir -p build

echo "== npm ci"
npm ci --legacy-peer-deps
echo "== prebuild ios"
npx expo prebuild --platform ios --clean --no-install
echo "== pod install"
# A pod the Mac's spec repo has never seen (expo-iap's `openiap`) fails resolution until the repo
# is refreshed. Refreshing every time costs minutes, so it is only done on the retry.
(cd ios && pod install) || {
  echo "== pod install failed; refreshing the spec repo and retrying"
  (cd ios && pod install --repo-update)
}

echo "== keychain"
security create-keychain -p "$KC_PW" "$KC"
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "$KC_PW" "$KC"
security import "$HOME/ZP6VK29GWR.cer" -k "$KC" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
# The .p12 was exported without a password.
security import "$HOME/ZP6VK29GWR.p12" -k "$KC" -P "" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PW" "$KC" >/dev/null
# shellcheck disable=SC2086
security list-keychains -d user -s "$KC" $ORIG_KEYCHAINS
# Capture, then grep: under `set -o pipefail` a `grep -q` that exits early
# SIGPIPEs the producer and fails the pipeline even on a match.
IDENTITIES=$(security find-identity -v -p codesigning "$KC")
grep -q "Apple Distribution" <<<"$IDENTITIES" \
  || { echo "no Apple Distribution identity in the temporary keychain" >&2; exit 3; }

echo "== manual signing on the app target"
P=ios/Undercut.xcodeproj/project.pbxproj
N=$(grep -c "PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;" "$P" || true)
[ "$N" -ge 1 ] || { echo "app target with bundle id $BUNDLE_ID not found in $P" >&2; exit 3; }
perl -0pi -e "s/(\t+)PRODUCT_BUNDLE_IDENTIFIER = \Q$BUNDLE_ID\E;\n/\$1PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;\n\$1CODE_SIGN_STYLE = Manual;\n\$1DEVELOPMENT_TEAM = $TEAM;\n\$1CODE_SIGN_IDENTITY = \"Apple Distribution\";\n\$1PROVISIONING_PROFILE_SPECIFIER = \"$PROFILE\";\n/g" "$P"

cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key><dict><key>$BUNDLE_ID</key><string>$PROFILE</string></dict>
  <key>uploadSymbols</key><true/>
  <key>uploadBitcode</key><false/>
</dict></plist>
PLIST

echo "== archive"
if ! xcodebuild -workspace ios/Undercut.xcworkspace -scheme Undercut -configuration Release -sdk iphoneos \
    -destination "generic/platform=iOS" -archivePath build/Undercut.xcarchive archive \
    OTHER_CODE_SIGN_FLAGS="--keychain $KC" > build/archive.log 2>&1; then
  echo "ARCHIVE FAILED — build/archive.log on the Mac; first errors:" >&2
  grep -n "error:" build/archive.log | grep -v warning | head -8 >&2 || true
  grep -n -A6 "The following build commands failed" build/archive.log | head -10 >&2 || true
  exit 3
fi
echo "== export"
if ! xcodebuild -exportArchive -archivePath build/Undercut.xcarchive -exportOptionsPlist build/ExportOptions.plist \
    -exportPath build/export > build/export.log 2>&1; then
  echo "EXPORT FAILED — build/export.log on the Mac:" >&2; grep -n "error" build/export.log | head -6 >&2 || true; exit 3
fi

echo "== verify"
IPA=build/export/Undercut.ipa
rm -rf build/ipa && mkdir -p build/ipa && unzip -q -o "$IPA" -d build/ipa
APP=$(ls -d build/ipa/Payload/*.app)
V=$(plutil -extract CFBundleShortVersionString raw "$APP/Info.plist")
B=$(plutil -extract CFBundleVersion raw "$APP/Info.plist")
ID=$(plutil -extract CFBundleIdentifier raw "$APP/Info.plist")
PROF=$(security cms -D -i "$APP/embedded.mobileprovision" | plutil -extract Name raw -)
FONTS=$(ls "$APP"/*.ttf 2>/dev/null | wc -l | tr -d ' ')
[ "$V" = "$UC_VERSION" ] && [ "$B" = "$UC_BUILD" ] && [ "$ID" = "$BUNDLE_ID" ] && [ "$PROF" = "$PROFILE" ] \
  || { echo "IPA mismatch: version $V build $B id $ID profile '$PROF' (wanted $UC_VERSION / $UC_BUILD / $BUNDLE_ID / '$PROFILE')" >&2; exit 4; }
[ "$FONTS" -ge 5 ] || { echo "IPA embeds $FONTS font files, expected 5 (expo-font plugin)" >&2; exit 4; }
SIGNATURE=$(codesign -dvv "$APP" 2>&1 || true)
grep -q "Authority=Apple Distribution" <<<"$SIGNATURE" || { echo "IPA is not signed with Apple Distribution:" >&2; echo "$SIGNATURE" | head -5 >&2; exit 4; }
echo "IPA ok: $V ($B) $ID, profile '$PROF', $FONTS fonts, $(du -h "$IPA" | cut -f1)"

if [ "${UC_SKIP_PUBLISH:-}" = 1 ]; then
  echo "UC_SKIP_PUBLISH=1: not uploading"
  exit 0
fi
echo "== upload"
if ! xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$KEY_ID" --apiIssuer "$ISSUER" > build/upload.log 2>&1; then
  echo "UPLOAD FAILED:" >&2; grep -i -E "error|ERROR" build/upload.log | head -6 >&2 || true; exit 5
fi
grep -E "UPLOAD SUCCEEDED|Delivery UUID" build/upload.log || true
