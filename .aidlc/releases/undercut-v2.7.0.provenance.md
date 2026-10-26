# Provenance — undercut 2.7.0 (uc-v2.7.0)

All three store targets built in one release run on 2026-10-26 from `da70ba1` (origin/master,
branch `release/uc-2.7.0` in the worktree `/data/f1-app-openf1`). First build with every target
since 2.5.3; 2.6.0 was an Android-only cut. Carries #225, #227, #229 and #231 (F-125, F-126,
F-127, F-129 app half, the F-119 ace-call-first follow-up). Nothing here is published yet: the
AAB is on no Play track, the APK is not on Amazon, and iOS build 58 is uploaded to App Store
Connect but attached to no version.

## How this cut was made

1. `aidlc run --tier release --unit undercut --version 2.7.0` on the Linux build box. The first
   run failed G03 because the worktree had no `newgame/` or `newgame/functions/` dependencies
   (Track Limits' stale copy is still typechecked by the gate); `npm ci` in both, then a re-run with
   `--no-cache` (a plain re-run reused the cached fail).
2. G03 warn (advisory lint only), G04/G05/G07/G08/G10/G16 pass, G13 hold on the standing evidence
   gap (no SBOM tool, no signature list, no reproducible hash). The hand-collected evidence below
   answers the hold the way 2.5.1 and 2.5.3 did; these builds are not reproducible as configured,
   so there is no second hash to compare.
3. `uc-v2.6.0` was tagged retroactively at `8377297` before the run so the release range started
   at 2.6.0 and not at 2.5.3. The run still re-stamped F-119 (shipped 2.5.2) to 2.7.0 and marked the
   server-only F-128 shipped in this build; both restored by hand before commit. The generated
   notes claimed the live score is on and a scroll fix that was never reproduced; rewritten in all
   ten languages.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.7.0-vc74.aab` | `7dcb8c6cef894a5fa55c476bbdfe5c5c2cb990634a3dc801cb55c21ef55ae08b` | 75239913 |
| `undercut-2.7.0-vc74-amazon.apk` | `a2d6bf582e1023fa2d62808830fa49bf1e5ca6b4b04cfc60a9a10f868acfb2c7` | 101949508 |
| `undercut-2.7.0-build58.ipa` | `82cbc7e790b26f3b7f35d2fd06194f0b6d5f4f4163bd90f5d72a8fa12bd87a5f` | 28034719 |

On `/mnt/smb/share/undercut/` (Android artifacts also on `natha@10.0.25.60:Downloads/`). The IPA
hash matches `shasum -a 256` of `~/projects/f1-app/build/export/Undercut.ipa` on the Mac.

## Signatures

- **AAB**: `jarsigner -verify` → `jar verified`; `keytool -printcert -jarfile` →
  `CN=Nathan Shanks, OU=Mobile, O=Undercut` (the upload key; Play re-signs).
- **APK** (`apksigner verify --print-certs`): same DN, certificate SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`; `aapt2 dump badging` →
  `com.undercut.app` versionCode 74, versionName 2.7.0.
- **IPA** (`codesign -dvv` on the Mac): Identifier `com.undercut.app`, Authority
  `Apple Distribution: Nathan Shanks (MWVD9BU5VW)`; embedded profile
  `Undercut AppStore Distribution`; Info.plist CFBundleShortVersionString 2.7.0, CFBundleVersion 58.
  `xcrun altool --upload-app` → `UPLOAD SUCCEEDED with no errors`, Delivery UUID
  `2bf51116-4085-40c0-9577-c6a378ff92ad` (14:50 local, 2026-10-26).

## In-binary content checks

Both Android JS bundles are Hermes bytecode (magic `c61f bc03`), 4 476 452 / 4 476 448 bytes;
strings were read with `strings -n 6` and `strings -n 6 -e l` (Hermes stores some literals as
UTF-16):

| string | AAB | meaning |
|---|---|---|
| `SO FAR` | present | F-129 `LIVE · SO FAR` stat label |
| `COUNTS WHEN SELECTIONS LOCK`, `ONE USED THIS WEEKEND` | present | F-126 counter lines |
| `MAKE ACE` | present | #225 inline ace button |
| `ALLOW_DEMO`, `demo=1` | absent | no demo-mode entry (the build scripts also assert this) |

## Not evidenced

- No SBOM (syft is not installed on the box) and no reproducible second build.
- No device run of this exact binary. The Play AAB was not installed on the emulator.
