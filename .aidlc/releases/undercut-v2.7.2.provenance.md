# Provenance — undercut 2.7.2 (uc-v2.7.2)

The picker fixes (PR #238, `76fc006` = origin/master) on top of 2.7.1, cut 2026-10-27 the same
evening, for the Mexico City round (lock 2026-10-31). All three store targets built in one
release run from the branch `release/uc-2.7.2` in the worktree `/data/f1-app-openf1`, whose only
difference from `76fc006` is the version stamp (2.7.2 / versionCode 78 / buildNumber 62) and the
release records.

## How this cut was made

1. `.env` and the other untracked inputs present in the worktree (the 2.7.0 lesson); the build
   scripts' guard confirmed the Firebase web API key in every bundle.
2. `aidlc run --tier release --unit undercut --version 2.7.2 --no-cache`: G03 warn (advisory
   lint only), G04 pass (three targets, bundle checks passed), G05 pass (no security-relevant
   hunks), G07 pass, G08 pass, G10 pass, G16 pass (9 languages), G13 hold — see the signoff.
3. Device evidence for the code in this cut: PR #238's own run (plain release APKs of `80622e5`
   and `5a4c998`, the owner's account, Android 37.1 emulator; shots on the share under
   `undercut/enh/picker-fix/`) — reserve line, pick band, pills below the name, partial-save
   summary, CANCEL and hardware-back guard, LEAVE WITHOUT SAVING, lineup untouched afterwards.
   For the store binaries themselves see "Device run of the Play artifact" below.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.7.2-vc78.aab` | `016fb711107faf04a748a0ca1427fed2a9c1dcaddb29f23d42199591305fcdd3` | 75252643 |
| `undercut-2.7.2-vc78-amazon.apk` | `d46a996048f97229806ce7724a7c5b6b9e9fb08e88909cb481968be72ec1dfa0` | 101966084 |
| `undercut-2.7.2-build62.ipa` | `32bff04148643c02604c26d2b11469e14524c78a402d8093b01db58d5408c2ee` | 28050164 |

On `/mnt/smb/share/undercut/` (Android artifacts also on `natha@10.0.25.60:Downloads/`).

## Signatures

- **AAB**: `jarsigner -verify` → `jar verified.` (the upload key, `CN=Nathan Shanks, OU=Mobile,
  O=Undercut`; Play re-signs).
- **APK** (`apksigner verify --print-certs`): same DN, certificate SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`; `aapt2 dump badging` →
  `com.undercut.app` versionCode 78, versionName 2.7.2.
- **IPA**: Info.plist CFBundleIdentifier `com.undercut.app`, CFBundleShortVersionString 2.7.2,
  CFBundleVersion 62; uploaded to App Store Connect by the run.

## In-binary content checks

Hermes bundles read with `strings -n 6` and `strings -n 6 -e l`:

| string | AAB / APK / IPA | meaning |
|---|---|---|
| `AIza` (one hit) | present | the Firebase web API key is inlined |
| `STILL OPEN` | present | the partial-save summary line, PR #238 |
| `ALLOW_DEMO` | absent | no demo-mode entry |

## Device run of the Play artifact

A universal APK built from `undercut-2.7.2-vc78.aab` with bundletool 1.18.3 (signed with the
upload key, so it installs over the signed-in 2.7.1 release build and keeps the session) on the
Android 37.1 emulator, the owner's account: `versionName=2.7.2` installed, launched to the Team
screen (a Play in-app review prompt appeared over the splash and was left alone), EDIT → Pick
Team → constructor tab: Aston Martin as the Pit Wall pick band with its label on its own line,
`LINEUP SAVED`; back popped straight to the Team screen with the lineup unchanged. Shot:
`undercut/enh/picker-fix/06-play-artifact-2.7.2-picker.png` on the share. The Play-signed binary
itself cannot be sideloaded (Play integrity protection exits it), as noted for 2.7.0/2.7.1.

## Not evidenced

- No SBOM (syft is not installed on the box) and no reproducible second build.
- The IPA and the Amazon APK were not run on a device; they are the same source and bundle as
  the AAB above.
