# Provenance — undercut 2.5.2 (uc-v2.5.2)

Collected by hand on 2026-10-09 from the built artifacts. G13 approved this release, and its
residual-risk note says the approval rests on gate verdicts alone because the artifact list and
signatures were not in its record. This file is that list.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.5.2-vc71.aab` | `25b5d6118c961ce0efcd608a67a2ff1f6ea69662e05093e4010ad6a1eecbb776` | 75085481 |
| `undercut-2.5.2-vc71-amazon.apk` | `1f6f58404357482f231234adb42d2d76b509c62e4b2beb1b3960acbf406b42f9` | 101799714 |
| `undercut-2.5.2-build53.ipa` | `8ac8361c99bc8a675787059de436d6c9abfe4bbfbc68de5bbb3e5b1d818f3c74` | 27859587 |

All three on `/mnt/smb/share/undercut/`. The IPA on the Mac at
`~/projects/f1-app/build/export/Undercut.ipa` has the same hash. Built from `566486d`.

## Signatures

- **AAB** (`jarsigner -verify -certs`): jar verified, `CN=Nathan Shanks, OU=Mobile, O=Undercut` —
  the upload key; Play re-signs.
- **Amazon APK** (`apksigner verify --print-certs`): same certificate, SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`, SHA-1
  `b9e5550621db608f927dca7eb7ec283d725a98b8`.
- **IPA** (`codesign -dv` on the Mac): `Apple Distribution: Nathan Shanks (MWVD9BU5VW)`, embedded
  profile `fe08ac16-b61e-4cc5-8294-278b50b3e6b7`, signed entitlement
  `applinks:undercut.humannpc.com`.

## Contents verified in the binaries

| check | AAB | Amazon APK | IPA |
|---|---|---|---|
| version | `2.5.2` in `base/manifest` (protobuf) | `versionCode='71' versionName='2.5.2'` | `CFBundleShortVersionString 2.5.2`, `CFBundleVersion 53` |
| F-119 in the JS bundle (`ACE CALL` string) | present | present | present |

iOS upload to App Store Connect: `UPLOAD SUCCEEDED with no errors`, Delivery UUID
`b615ebb7-83ed-4bc3-accf-2aa0c3e4c3a1`.

## What is not evidenced

- The AAB's versionCode was read from `app.config.js` (71) and the build script's own check, not
  parsed out of the protobuf manifest.
- No reproducible-build hash and no SBOM diff (`syft` is not installed). No `package.json` or
  lockfile changed since `uc-v2.5.1`.
- The store binaries themselves were not launched. The same commit was run as a Release build on
  the iOS simulator before the release run, and the pre-review-fix commit on the Android emulator.
