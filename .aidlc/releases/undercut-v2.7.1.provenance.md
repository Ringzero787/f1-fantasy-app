# Provenance — undercut 2.7.1 (uc-v2.7.1)

Hotfix for 2.7.0, which crashed at launch on every platform (built from a worktree without
`.env`, so the Firebase web config was empty). All three store targets built in one release run on
2026-10-27 from `fe26547` (branch `fix/uc-2.7.1-firebase-env` in the worktree
`/data/f1-app-openf1`, four commits on top of `48ecc28` = origin/master). Carries the build-script
guard, F-130 (weekend recap from the round record, one per team) and the signed-in config refetch.

## How this cut was made

1. `.env` copied into the worktree beside the other untracked inputs; the three build scripts now
   refuse to start without `EXPO_PUBLIC_FIREBASE_API_KEY` and fail after the build when the bundle
   carries no Firebase web API key.
2. Two earlier 2.7.1 runs today were not shipped: the first (vc75 / iOS build 59, before F-130) was
   a throwaway that proved the guard on all three targets and launched to Welcome on the emulator;
   two more were stopped early as F-130 grew. This run stamped versionCode 76 / build 60 by hand
   (build 59 is already in App Store Connect).
3. `aidlc run --tier release --unit undercut --version 2.7.1 --no-cache`: G03 warn (advisory lint),
   G04 pass (the bundle check passed on all three targets), G05/G07/G10 warn (reviews, no blocker),
   G08/G16 pass, **G13 approve**. Generated notes rewritten in ten languages (Fixed / Changed).
4. Verified before the run on the Android 37.1 emulator with a plain release APK of the same
   source, signed in with the owner's account: the recap for the United States round showed +283,
   ROUND WINNER, SEASON P2 / 10 · 3,333 PTS, six picks with ACE ×2, the missed Moonshot card
   (−200) with the weekend line, NEXT · RD 21 · MEXICO CITY with 2 LEFT, and TEAM 1 / 2 with the
   second team's own recap (+171) behind NEXT.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.7.1-vc76.aab` | `462349a19d392842df8cb0c9a288fafc4d0b69974779b1fc9b3867c67af27b3c` | 75248981 |
| `undercut-2.7.1-vc76-amazon.apk` | `e451fd88fb2fdf5f9f2192a7d8a81e3dd1e41cffc848409ad81d5a83d6dde367` | 101963144 |
| `undercut-2.7.1-build60.ipa` | `240b4a97335abaeda05ee895bec191320be39f5c4b198e7825465dde3031f591` | 28047473 |

On `/mnt/smb/share/undercut/` (Android artifacts also on `natha@10.0.25.60:Downloads/`). The
vc75 / build 59 artifacts and `sideload-only-undercut-2.7.1-vc75-universal.apk` on the share are
the throwaway cut; never upload them.

## Signatures

- **AAB**: `jarsigner -verify` → `jar verified`; `keytool -printcert -jarfile` →
  `CN=Nathan Shanks, OU=Mobile, O=Undercut` (the upload key; Play re-signs).
- **APK** (`apksigner verify --print-certs`): same DN, certificate SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`; `aapt2 dump badging` →
  `com.undercut.app` versionCode 76, versionName 2.7.1.
- **IPA**: Info.plist CFBundleIdentifier `com.undercut.app`, CFBundleShortVersionString 2.7.1,
  CFBundleVersion 60; App Store Connect lists build 60 as VALID (id `c8aaff0a-…`).

## In-binary content checks

All three JS bundles are Hermes bytecode. Read with `strings -n 8` and `strings -n 8 -e l`:

| string | AAB / APK / IPA | meaning |
|---|---|---|
| `AIza` (one hit) | present | the Firebase web API key is inlined (2.7.0 had none) |
| `SCORED NOTHING` | present | F-130 recap lines |
| `fetchedSignedIn` | present | the signed-in config refetch |
| `ALLOW_DEMO`, `demo=1` | absent | no demo-mode entry (the build scripts also assert this) |

## Not evidenced

- No SBOM (syft is not installed on the box) and no reproducible second build.
- The exact store binaries were not run on a device; the emulator run was a release APK of the
  same source built minutes earlier.
