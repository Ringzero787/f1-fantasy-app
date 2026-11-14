# Provenance — undercut 2.8.0 (uc-v2.8.0)

The owner's 2026-11-13 playtest list (F-142 #266, F-143 #267, F-145 #269) and the unreleased app
halves of F-131 (Pit Wall gold, #241/#243/#246), F-136 (held roster reopen line, #256) and
F-138/F-139 (Hirakawa and Câmara by car number and name, #260/#262), on
top of 2.7.2, cut 2026-11-14 for the Las Vegas round (lock ~2026-11-21 03:00Z). Built from
`cc06fdc` (origin/master) on the branch `release/uc-2.8.0` in the worktree
`/data/f1-app-openf1`; the only difference from `cc06fdc` is the version stamp (2.8.0 /
versionCode 79 / buildNumber 63) and the release records.

## How this cut was made

1. `.env` and the other untracked build inputs present in the worktree; dependencies unchanged
   since 2.7.2 (no `package*.json` change in the range).
2. First run: G04 built all three targets, but the iOS upload failed (`Cannot determine the
   Apple ID from Bundle ID`): Apple's agreements had lapsed and the ASC API returned
   `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. The owner accepted both pending
   agreements; the API cleared within minutes (the in-app purchase `pitwall.pass.season` reads
   APPROVED again). The first run's Android artifacts were moved to `superseded-2.8.0-run1/`
   and never uploaded anywhere.
3. `aidlc run --tier release --unit undercut --version 2.8.0 --no-cache` from a clean
   `app.config.js`: G03 warn (advisory lint only), G04 pass (three targets, bundle checks
   passed, iOS uploaded: `UPLOAD SUCCEEDED`, Delivery UUID `eba55858-1cb2-48d2-baca-35b55c88235a`),
   G05 pass, G07 pass, G08 pass, G10 pass, G16 pass (9 languages). G13 held on the evidence gap
   and its verdict aborted on the 200-character title limit (aidlc#6); one `-g G13` retry
   approved.
4. Release records fixed by hand after the retry:
   - `.aidlc/features.yaml`: the run re-stamped F-111 (2.5.0) and F-129 (2.7.0) as 2.8.0 —
     restored. It also flipped the server-only F-134, F-137 and F-140 to `shipped`; they are back
     to their earlier status (F-140's email is not switched on yet). F-138 and F-139 keep 2.8.0:
     their app halves (car-number map, display names) are in this build.
   - Notes (10 languages) and `CHANGELOG.md` rewritten: the generated text led on 2.7.0's
     running score, described the ace call as a notification and auto-fill as saving partial
     lineups, listed 2.7.2's cheapest-finish block as new (2.8.0 relaxes it), and the retry left
     a second 2.8.0 changelog section.
   - The signoff's "What shipped" list and duplicated Residual-risk block.
   - The release range: tag `uc-v2.7.2` sits on `616e001`, the release branch commit, which is
     not in master's history (#239 was squash-merged as `6b209ca`), so the engine measured from
     `uc-v2.7.1`. Content since 2.7.2 is `6b209ca..cc06fdc`.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.8.0-vc79.aab` | `f4eb08b0825456624381b6336ddbf158d8d1de9b5384b327f7d08177c5c2b44a` | 75258288 |
| `undercut-2.8.0-vc79-amazon.apk` | `96ea70f64e28141a3101681a0ef0d73b85b87a9f7ea2e43ebb13b23455ccbf51` | 101976124 |
| `undercut-2.8.0-build63.ipa` | `5f16bec76ce0e3ba1947ea4f6143b3a12c9fe70c9e536ae9799ba353449c7d1e` | 28057349 |

On `/mnt/smb/share/undercut/`.

## Signatures

- AAB (upload key): `CN=Nathan Shanks, OU=Mobile, O=Undercut`, cert SHA-256
  `70:EC:4C:19:…:50:16:CF:E7`, valid to 2053-07-08.
- Amazon APK: `apksigner verify` passes, same certificate (SHA-256 `70ec4c19…5016cfe7`);
  `aapt2 dump badging`: `com.undercut.app`, versionCode 79, versionName 2.8.0.
- IPA: `codesign --verify --deep --strict` OK; `Authority=Apple Distribution: Nathan Shanks
  (MWVD9BU5VW)`; Info.plist 2.8.0 / 63 / `com.undercut.app`.

## In-binary content checks

Each JS bundle (Hermes bytecode; checked with `strings` and `strings -e l`):

| check | AAB | Amazon APK | IPA |
|---|---|---|---|
| Firebase web key (`AIza…`, the 2.7.0 crash) | 1 | 1 | 1 |
| `PIT WALL PLAN` (F-145) | 1 | 1 | 1 |
| `LEAVES TOO LITTLE` (F-142 TIGHT hint) | 1 (UTF-16) | — | 1 (UTF-16) |

## Not evidenced

- No SBOM (syft is not installed on the build box).
- The builds are not reproducible as configured, so there is no second hash to compare.
- No device run of these exact binaries yet; do the Play-install launch check before promoting.
