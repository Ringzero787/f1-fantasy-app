# Provenance — undercut 2.6.0 (uc-v2.6.0)

Android-only store cut. Amazon and iOS were not built this round. At the cut the AAB was on the
share and on no Play track. **Published since:** OP-178 put vc73 on Google Play production on
2026-10-22 (the first player build since 2.5.1, so its what's-new carries the 2.5.3 items too);
OP-179, OP-180 and OP-181 put the same build on beta, alpha and internal on 2026-10-23, replacing
vc41, vc39 and vc65, which is what cleared Play's target-API-level notice.

## How this cut was made

1. Pack and F-020 merged to `origin/master` as #222 (`39ded1b`) and #223 (`2a0d8f8`).
2. Production deploys on that SHA: OP-173 hosting, OP-174 rules, OP-175 Pit Wall Pages,
   OP-176 `createTeamSecure` + `autoLockTeams`. OP-177 Play listing apply failed 403
   (firebase-adminsdk can GET the listing and historically upload AABs; PUT listings/en-US is
   refused — grant **Edit store listing** / store presence on
   `firebase-adminsdk-fbsvc@f1-app-18077.iam.gserviceaccount.com` in Play Console, then
   `aidlc op dryrun OP-177` and `aidlc op apply OP-177`).
3. `AIDLC_RELEASE_VERSION=2.6.0 bash scripts/release/build-uc-aab.sh` on the Linux build box.
   First sign failed because `source .signing.env` mangled `UC_KEYSTORE_PASSWORD`; the plugin
   reads the file itself. Retry with those vars unset signed cleanly.

## Artifacts and hashes

| artifact | sha256 | bytes |
|---|---|---|
| `undercut-2.6.0-vc73.aab` | `9a5b2fc1c51b74866609e427d448abf587662bdd846e44731637b5d9a2c8130a` | 75236788 |

On `/mnt/smb/share/undercut/` and `natha@10.0.25.60:Downloads/`.

## Signatures

- **AAB** (`keytool -printcert -jarfile`): `O=Undercut` — the upload key; Play re-signs.
