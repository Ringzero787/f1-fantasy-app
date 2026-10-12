# Provenance — undercut 2.5.3 (uc-v2.5.3)

Collected by hand on 2026-10-12 from the built artifacts. **G13 records `hold`** for this release,
twice, on the one thing it has held every Undercut release on since 2.4.3: the artifact list,
signatures, reproducible-build hash and SBOM diff are not in its evidence package (`syft` is not
installed and the gate does not gather the rest). Every other gate passed. This file is that
artifact list; it answers the hold and does not clear it.

## How this release was run

1. First run at `71b293a`: all three targets built (iOS build 54 uploaded to App Store Connect),
   then **G05 failed** on nine critical dependency findings published since 2.5.2, and G13 held on
   them. That was a real hold.
2. PR #215 patched the four packages (proxy-addr, shell-quote, handlebars, tinypool) in the
   lockfiles. No application code.
3. Second run at `2c42c36`: every target rebuilt, G05 passes, G13 holds on the evidence gap only.
   The iOS build number was moved to 55 by hand because 54 was already on App Store Connect; the
   Android code stayed 72, which no store has seen.

**The artifacts below are from the second run.** Build 54 and the first run's AAB and APK are
superseded; `undercut-2.5.3-build54.ipa` is still on the share and should not be submitted.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.5.3-vc72.aab` | `23b46e9ed8c35b510e917d5175bef01d5a8d49142d4a889e61c2db62cdc1ed61` | 75187597 |
| `undercut-2.5.3-vc72-amazon.apk` | `f0e24d0f723b8adb6a4137f8b47172259cb7e4eefe2f7ae6b95eb9f88ec93a91` | 101910153 |
| `undercut-2.5.3-build55.ipa` | `8547a56f01ecc9153cfde4827bdfb6e103ed26821466fe3b5deae97d1ca0829e` | 27964269 |

All three on `/mnt/smb/share/undercut/`. The IPA on the Mac at
`~/projects/f1-app/build/export/Undercut.ipa` has the same hash.

## Signatures

- **AAB** (`jarsigner -verify -certs`): jar verified, `CN=Nathan Shanks, OU=Mobile, O=Undercut` —
  the upload key; Play re-signs.
- **Amazon APK** (`apksigner verify --print-certs`): same certificate, SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`, SHA-1
  `b9e5550621db608f927dca7eb7ec283d725a98b8`.
- **IPA** (`codesign -dv` on the Mac): `Apple Distribution: Nathan Shanks (MWVD9BU5VW)`, embedded
  profile `fe08ac16-b61e-4cc5-8294-278b50b3e6b7`, signed entitlements
  `applinks:undercut.humannpc.com` and `com.apple.developer.applesignin`.

## Contents verified in the binaries

| check | AAB | Amazon APK | IPA |
|---|---|---|---|
| version | `2.5.3` in `base/manifest` (protobuf) | `versionCode='72' versionName='2.5.3'` | `CFBundleShortVersionString 2.5.3`, `CFBundleVersion 55` |
| F-120 round report in the JS bundle (`ROUND REPORT`, `CALL OF THE ROUND`) | present | present | present |
| F-119 ace advice (`ACE CALL`) | present | present | present |
| Google Sans Medium embedded | 6 fonts in `assets/fonts`, one of them it | present in the APK | 6 `.ttf` in the app, one of them it |
| sign-in artwork | in the resource table | 3 `assets_signin_*` drawables | `assets/assets/signin/google-g*.png` |
| demo entry | flag absent from the bundle | absent | absent |

iOS upload to App Store Connect: `UPLOAD SUCCEEDED with no errors`, Delivery UUID
`28235675-eb96-4769-9c46-d26b81c761fa`.

**The Amazon APK was installed and launched** on the Android emulator (the first run's build of the
same application code): 2.5.3 (72), the sign-in screen renders the Google mark, Google Sans and
Amazon's button image. The second run's APK was installed there as well.

## What is not evidenced

- The AAB's versionCode was read from `app.config.js` (72) and the build script's own check, not
  parsed out of the protobuf manifest.
- No reproducible-build hash and no SBOM diff. The dependency change since `uc-v2.5.2` is the four
  packages in #215, plus nothing in `package.json` at the root.
- The AAB and the IPA were not launched; nobody has completed a real sign-in with Google, Apple or
  Amazon on any of these binaries, and the buttons changed in this release.
