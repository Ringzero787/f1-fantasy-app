# Provenance — undercut 2.7.1 (uc-v2.7.1)

Hotfix for 2.7.0, which crashed at launch on every platform (built from a worktree without
`.env`, so the Firebase web config was empty). All three store targets built in one release run on
2026-10-27 from `40c64ea` (branch `fix/uc-2.7.1-firebase-env` in the worktree
`/data/f1-app-openf1`, five commits on top of `48ecc28` = origin/master). Carries the build-script
guard, F-130 (weekend recap from the round record, one per team) and the signed-in config refetch.

## How this cut was made

1. `.env` copied into the worktree beside the other untracked inputs; the three build scripts now
   refuse to start without `EXPO_PUBLIC_FIREBASE_API_KEY` and fail after the build when the bundle
   carries no Firebase web API key.
2. Earlier 2.7.1 runs today were not shipped: vc75 / iOS build 59 (before F-130) proved the guard
   on all three targets and launched to Welcome on the emulator; vc76 / build 60 was complete and
   recorded when the model review found that the signed-in config refetch could be skipped for a
   returning player (the recap would then never show), so it was fixed (`40c64ea`) and cut again as
   vc77 / build 61. Builds 59 and 60 sit unused in App Store Connect; vc75 and vc76 never reached
   Play. The vc76 Amazon APK was uploaded by the owner before vc77 existed and is to be replaced.
3. `aidlc run --tier release --unit undercut --version 2.7.1 --no-cache`: G03 warn (advisory lint),
   G04 pass (the bundle check passed on all three targets), G05/G07/G10 warn (reviews, no blocker),
   G08/G16 pass, G13 approve. Generated notes rewritten in ten languages (Fixed / Changed).
4. Verified on the Android 37.1 emulator with plain release APKs of the same source, signed in with
   the owner's account: the recap for the United States round showed +283, ROUND WINNER, SEASON
   P2 / 10 · 3,333 PTS, six picks with ACE ×2, the missed Moonshot card (−200) with the weekend
   line, NEXT · RD 21 · MEXICO CITY with 2 LEFT, TEAM 1 / 2 with the second team's own recap (+171)
   behind NEXT; and, for the final source, a cold start of the signed-in install fetched the config
   twice (startup, then signed in) and opened the recap with its Moonshot line.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.7.1-vc77.aab` | `bee5678fa793cc43369f081d92ae0dd349e65ce22a072fc2b8f389ec8025b5c3` | 75250730 |
| `undercut-2.7.1-vc77-amazon.apk` | `28b8210d6daba650bb27262edb4059459a35f7aa707d2f723a273eaf6b839071` | 101963668 |
| `undercut-2.7.1-build61.ipa` | `53473197d48d027097ed16cb6e346fec8b6b4f1a055efe363d2d8ca7deafa31c` | 28047816 |

On `/mnt/smb/share/undercut/` (Android artifacts also on `natha@10.0.25.60:Downloads/`). The
vc75 / vc76 / build 59 / build 60 artifacts and `sideload-only-undercut-2.7.1-vc75-universal.apk`
on the share are the earlier cuts; never upload them.

## Signatures

- **AAB**: `jarsigner -verify` → `jar verified`; `keytool -printcert -jarfile` →
  `CN=Nathan Shanks, OU=Mobile, O=Undercut` (the upload key; Play re-signs).
- **APK** (`apksigner verify --print-certs`): same DN, certificate SHA-256
  `70ec4c19a662b730214786b3a2f10fd89115ad4e7941ba7344f3e1765016cfe7`; `aapt2 dump badging` →
  `com.undercut.app` versionCode 77, versionName 2.7.1.
- **IPA**: Info.plist CFBundleIdentifier `com.undercut.app`, CFBundleShortVersionString 2.7.1,
  CFBundleVersion 61; uploaded to App Store Connect by the run.

## In-binary content checks

All three JS bundles are Hermes bytecode. Read with `strings -n 8` and `strings -n 8 -e l`:

| string | AAB / APK / IPA | meaning |
|---|---|---|
| `AIza` (one hit) | present | the Firebase web API key is inlined (2.7.0 had none) |
| `SCORED NOTHING` | present | F-130 recap lines |
| `ensureSignedInConfig` | present | the signed-in config refetch, fixed form |
| `ALLOW_DEMO`, `demo=1` | absent | no demo-mode entry (the build scripts also assert this) |

## Not evidenced

- No SBOM (syft is not installed on the box) and no reproducible second build.
- The exact store binaries were not run on a device; the emulator runs were release APKs of the
  same source built minutes earlier.
