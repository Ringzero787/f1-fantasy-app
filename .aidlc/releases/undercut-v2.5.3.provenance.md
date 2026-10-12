# Provenance — undercut 2.5.3 (uc-v2.5.3)

Collected by hand on 2026-10-12 from the built artifacts.

## How this release was run

It took three complete builds, and the artifacts below are from the third.

1. First run at `71b293a`: all three targets built (iOS build 54 uploaded to App Store Connect),
   then **G05 failed** on nine critical dependency findings published since 2.5.2, and G13 held on
   them. That was a real hold. PR #215 patched the four packages (proxy-addr, shell-quote,
   handlebars, tinypool) in the lockfiles; no application code.
2. Second run at `2c42c36`: everything rebuilt (iOS build 55 uploaded), G05 passed, and G13 held
   twice on the evidence gap it has held every Undercut release on since 2.4.3: no artifact list,
   signatures, reproducible-build hash or SBOM diff in its package.
3. The owner then tested the Play and Amazon builds on the Android emulator and asked for two
   changes: the Amazon build's button order (#218) and the recap button's label (#219). A run
   started after the first of those was stopped before its iOS upload. Third complete run at
   `586c791`, with both: everything rebuilt, iOS build 56 uploaded.

**Sign-off on the third run: G13 approves.** Read that for what it is. The run was made on the
release branch, where the earlier records were already committed, so the gate judged the change
set to be "metadata-only" and found no hold trigger. Nothing about the artifact evidence changed
between the hold and the approve: `syft` is still not installed and the gate still does not
gather signatures. This file is that evidence, collected by hand, as it was for 2.5.1 and 2.5.2.

G05 passes with no critical finding left, and with about sixty older high and medium advisories
still covered by the standing `GHSA-` waiver, which expires on 2026-10-31. G03 warned on the
advisory lint, as it has on every release.

Builds 54 and 55 are superseded and should not be submitted. Their IPAs are still on the share.
The Android version code is 72 in all three runs; no store has seen it, so it was reused.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.5.3-vc72.aab` | `977251e072e4a216f1ff702750c4c7e171a0d64a3473e215cd1a2b368f1773e9` | 75187443 |
| `undercut-2.5.3-vc72-amazon.apk` | `4dca18e38577c3af3786bee4ccfbb920dc4f0b376db8dcffa590a0ec532be8d6` | 101910125 |
| `undercut-2.5.3-build56.ipa` | `3d94df7d194a1f16098bbaba6ebb69c455190b283d38966ac3505a163fcbf3df` | 27966257 |

All three on `/mnt/smb/share/undercut/`. The IPA on the Mac at
`~/projects/f1-app/build/export/Undercut.ipa` has the same hash.

## Signatures

- **AAB** (`jarsigner -verify`): jar verified, `CN=Nathan Shanks, OU=Mobile, O=Undercut` — the
  upload key; Play re-signs.
- **Amazon APK** (`apksigner verify --print-certs`): same certificate, SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`.
- **IPA** (`codesign -dv` on the Mac): `Apple Distribution: Nathan Shanks (MWVD9BU5VW)`, embedded
  profile `fe08ac16-b61e-4cc5-8294-278b50b3e6b7`.

## Contents verified in the binaries

| check | AAB | Amazon APK | IPA |
|---|---|---|---|
| version | 2.5.3 (code 72 from `app.config.js` and the build script) | `versionCode='72' versionName='2.5.3'` | `CFBundleShortVersionString 2.5.3`, `CFBundleVersion 56` |
| F-120 round report (`ROUND REPORT`) | present | present | present |
| the recap button reads `LEAGUE SCORES`, and the old label is gone | yes | yes | yes |
| F-119 ace advice (`ACE CALL`) | present | present | present |
| Google Sans Medium embedded | 6 fonts in `assets/fonts` | present | 6 `.ttf` in the app |
| demo entry | flag absent from the bundle | absent | absent |

iOS upload to App Store Connect: `UPLOAD SUCCEEDED with no errors`, Delivery UUID
`92a54ecb-bc10-415f-969e-cf21d245b36b`.

## Launched

On the Android emulator, 2026-10-12:
- **The Amazon APK**, from the first and second runs: 2.5.3 (72) starts on the sign-in screen with
  the Google mark, Google Sans and Amazon's button image. Its order then was Amazon, Apple, Google.
- **The Play build**, as a universal APK made from the AAB with bundletool and signed with the
  same key: the order reads Google, Apple, Amazon. The owner signed in and used it.
- The third run's Play and Amazon builds were installed there after this file was written; see
  the release PR for what was seen.

## What is not evidenced

- No reproducible-build hash and no SBOM diff. The dependency change since `uc-v2.5.2` is the four
  packages in #215.
- The IPA was not launched on a device or simulator.
- A real sign-in with Apple or Amazon on these binaries; the buttons changed in this release.
