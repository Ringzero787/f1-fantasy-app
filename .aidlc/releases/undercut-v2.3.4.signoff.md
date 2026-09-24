# Sign-off uc-v2.3.4

Decision: **approve** — No blocking gate failed without a waiver, the only waiver carries a documented reason and expiry, and no artifact is recorded as unsigned or hash-mismatched; the remaining issues (missing SBOM, lint advisory, unverifiable artifact list) are record gaps rather than stated hold triggers.

# Release sign-off: undercut 2.3.4 (f1-fantasy-app)

**Tag:** uc-v2.3.4 (since uc-v2.3.3) · **Commit:** 9a3c27d4 · **Notes:** .aidlc/releases/undercut-v2.3.4.md · **Changelog:** CHANGELOG.md

## What shipped
- F-029
- F-062
- F-075

## Gate verdicts
| Gate | Verdict | Depth / notes |
|---|---|---|
| G01 | pass | Registry/symbol dedupe; request "TL: repair race schedules from seed data" matched no existing entry (note: TL-labelled item in an Undercut release) |
| G03 | **warn** | Advisory only: `npm run lint` failed (low) |
| G04 | pass | — |
| G05 | pass | Scanners only; no security-relevant hunks |
| G07 | pass | — |
| G08 | pass | No regression |
| G10 | pass | — |
| G14 | pass | OP-026 tl-script: safe to apply |
| G15 | skip | No domain checks apply |

No blocking gate failed.

## Waivers
- **G05 / GHSA-** — by nathan, 2026-09-18, expires 2026-10-31. Reason: pre-existing dependency advisories in the functions lockfile (F-027 dependency bump pass), untouched by this PR; waived by title because CI reports absolute paths. **Acceptable:** reason, owner, and expiry are present and the scope is bounded to a lockfile this release does not modify. Note the waiver was not exercised — G05 returned no findings — so it should be re-confirmed as still necessary before it is renewed.

## Evidence gaps
- **SBOM:** not generated (`syft missing`). No dependency diff vs 2.3.3 is on record.
- **Artifacts / signatures / reproducible-build hash:** not present in the attached evidence; signature and hash verification could not be performed from the record. No artifact is *recorded* as unsigned or mismatched.

## Residual risk
The release record is incomplete: syft was unavailable so no SBOM diff exists for 2.3.4, and the artifact list with signatures and reproducible-build hash were not present in the evidence, so supply-chain provenance for this release rests on pipeline defaults rather than a checked record. The lint advisory (G03) indicates code-quality drift. Pre-existing GHSA advisories in the functions lockfile remain open under a waiver expiring 2026-10-31. The G01 verdict references a Track Limits task in an Undercut release and should be reconciled with the release notes. Overall risk is low for a maintenance-scale release with no security-relevant hunks, but the provenance gap must be closed before the next sign-off.

**RELEASE: approve** — no blocking gate failed without a documented waiver and no artifact is recorded as unsigned or hash-mismatched; the outstanding items are record gaps (missing SBOM, unattached artifact list) rather than hold triggers.

## Residual risk
The release record is incomplete: syft was unavailable so no SBOM diff exists for 2.3.4, and the artifact list with signatures and reproducible-build hash were not present in the evidence, meaning supply-chain provenance for this release rests on the pipeline's default behaviour rather than on a checked record. The lint advisory (G03) indicates code-quality drift that could mask real defects in future diffs. Pre-existing GHSA advisories in the functions lockfile remain unaddressed under a waiver expiring 2026-10-31. The G01 verdict references a Track Limits task while this is an Undercut release, suggesting a possible scope-labelling mix-up that should be checked against the release notes. Overall risk is low for a maintenance-scale release with no security-relevant hunks, but the provenance gap should be closed before the next sign-off.

## Manual artifact verification (2026-09-24, build box; cosign and syft are not installed)

All three artifacts come from the single publishing run on commit 9a3c27d. G13 held once for missing evidence and approved on a re-run of that gate alone (`-g G13`, `UC_SKIP_PUBLISH=1`); nothing was rebuilt or re-uploaded. First release with R8 minification (PR #73), verified beforehand on the emulator with a real account.

| Artifact | SHA-256 | Signature |
|---|---|---|
| `undercut-2.3.4-vc59.aab` (Play) | `85edaf2073e9fbdaf6ae24a28f67bfe3f05fd4223f1798662f1a251947053925` | `keytool -printcert -jarfile`: Undercut certificate `70:EC:4C:19:…:16:CF:E7` |
| `undercut-2.3.4-vc59-amazon.apk` (Amazon) | `06ad0bb4cd7201dfe81cf949394d21e948deebbd96576154e9d1bd66c671cb05` | `apksigner verify`: same certificate; versionCode 59, versionName 2.3.4 |
| `undercut-2.3.4-build42.ipa` (App Store) | `4185034a4fcbb31422956a85a2ede62d33594552aac978ea2a792b2346f36754` | com.undercut.app 2.3.4 (42), "Undercut AppStore Distribution", team MWVD9BU5VW, get-task-allow false; altool "UPLOAD SUCCEEDED with no errors", Delivery UUID fcba51d0-9e1c-4ad1-a8b9-3e2834dcd05a |

The generated changelog listed the Pit Wall portal and F-059 step B as shipped in this app build; corrected by hand. F-059 and F-075 stay `building`.
