# Sign-off uc-v2.5.0

Decision: **hold** — No artifact list or signatures and no reproducible-build hash were provided; signing off that artifacts are signed and the build reproduces is not possible on the attached evidence.

# Release sign-off — undercut (f1-fantasy-app) v2.5.0

**Tag:** uc-v2.5.0 · **Previous:** uc-v2.4.3 · **Commit:** 61652a98 · **Bundle:** com.undercut.app (Google Play, Apple, Amazon)

## What shipped
F-099, F-100, F-101, F-103, F-104, F-105, F-106, F-107, F-108, F-110, F-111, F-112. Release notes at `.aidlc/releases/undercut-v2.5.0.md`, changelog updated, notes translated 9/9 languages.

## Gates
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory `npm run lint` failed (low). Non-blocking. |
| G04 | pass | — |
| G05 | pass | Scanners only — no security-relevant hunks in diff. |
| G07 | pass | Trademark watchlist; "Grand Prix" hit waived (test fixtures). Gate has no USPTO/EUIPO credentials — a gap, not a clearance. |
| G08 | pass | No perf regression. |
| G10 | pass | — |
| G16 | pass | 9 languages in sync; ICU plural finding waived. |
| G06, G14 | *no verdict attached* | Waivers reference these gates but no verdict for 61652a98 is in the attached set. |

## Waivers
| Gate | Finding | Assessment |
|---|---|---|
| G05 | `GHSA-` (title match) | Acceptable with caveat: pre-existing functions lockfile advisories, PR doesn't touch the lockfile, expires 2026-10-31. Prefix-match is broad; cannot scope it without an SBOM. Narrow to specific IDs on renewal. |
| G14 | Destructive OP-033 | Acceptable: gen-1→gen-2 recreate of two functions that hold no data and are already broken in prod; OP-034 dry-run clean; owner-approved 2026-09-24. |
| G06 | Hydration-gated language apply | Acceptable: LaunchReveal holds native splash via `preventAutoHideAsync()`; evidence cited in bootstrap.ts and F-079 spec. |
| G16 | Plural form missing ICU syntax | Acceptable: i18next suffix plurals under compatibilityJSON v4; gate prompt fixed upstream (G16@2). |
| G07 | Watchlist mark "Grand Prix" in new name | Acceptable: only matches are unit-test fixtures in `newgame/functions/scripts/fixRaceSchedules.test.js`; descriptive use of real event names is permitted by repo trademark policy; scanner path-scoping gap filed as aidlc#9. |

All waivers have a reason and an author. None are empty.

## Missing evidence
- **Artifact list with signatures — not attached.** Cannot confirm any artifact is signed.
- **Reproducible-build hash — not attached.** Cannot confirm it matches.
- **SBOM — `syft missing`.** No SBOM diff since 2.4.3; dependency delta unknown and the G05 waiver cannot be scoped.
- Gate verdicts attached are for a single commit; G06/G14 verdicts referenced by waivers are absent.

## Residual risk
Code-side risk is low: the security diff was scanner-only, no perf regression, i18n in sync, and the destructive op is confined to two dead, data-less functions that are immediately recreated. The material residual risk is provenance and supply chain: no SBOM diff, no signatures, no reproducible-build hash, so the shipped binaries cannot be tied to commit 61652a98 and the dependency surface change is unverified. Trademark clearance remains an open gap (no registry lookup), mitigated by the repo's descriptive-use policy.

## Decision
No attached gate failed, and every waiver is reasoned — on the gate and waiver evidence alone this would approve. But the sign-off is also an attestation that artifacts are signed and the build reproduces, and neither the artifact list nor the repro hash was provided. Attach the signed artifact list, the reproducible-build hash, and the syft SBOM diff and this converts to approve without further review.

**RELEASE: hold** — artifact signatures and reproducible-build hash were not provided, so two of the four hold conditions cannot be verified.

## Residual risk
Code-side risk is low: the diff was scanner-only for security (G05), no perf regression (G08), i18n in sync (G16), and the G14 destructive op OP-033 is limited to two already non-functional data-less gen-1 functions recreated by OP-034. The material residual risk is supply-chain and provenance: without an SBOM diff the dependency surface change since 2.4.3 is unknown and the broad 'GHSA-' G05 waiver cannot be scoped; without signatures and a matching reproducible-build hash the shipped binaries cannot be tied to commit 61652a98. The G03 lint failure is advisory and the G07 trademark finding is confirmed to be test fixtures, but the gate still has no USPTO/EUIPO lookup so naming clearance remains an open gap rather than a pass.

## Hand verification appended after the run (2026-10-07)
cosign and syft are not installed on the build box, so G13 never sees signature or SBOM evidence; the hold above is that gap, not a defect (2.3.2 and 2.4.3 shipped the same way). Verified by hand:

| Artifact | SHA-256 | Signing |
|---|---|---|
| `undercut-2.5.0-vc69.aab` (Play) | `1be70cd92a11b51ce6a8557710b4d63a01e02222e702e3a5d6ed9ac67a4be135` | `keytool -printcert`: CN=Nathan Shanks, OU=Mobile, O=Undercut, valid to 2053-07-08; cert SHA-256 `70:EC:4C:19:…:16:CF:E7` (same as 2.3.2) |
| `undercut-2.5.0-vc69-amazon.apk` (Amazon) | `9bb0bc74c602c8f39b07a631c87035b4c4d59c4b2724a6c1c0a709d2350da3f0` | `apksigner verify --print-certs`: same Undercut certificate (`70ec4c19…5016cfe7`); `aapt2 dump badging`: versionCode 69, versionName 2.5.0 |
| `undercut-2.5.0-build51.ipa` (App Store) | `146ae488b83a58f7a6ce7e1d5c22cfde51196bfe7b5f95d264a4bd1fa7cb06eb` | Info.plist: com.undercut.app 2.5.0 (51); embedded profile "Undercut AppStore Distribution" (Nathan Shanks); `_CodeSignature/CodeResources` present (signed on the Mac Mini; codesign cannot be re-verified from Linux) |

Copies: all three on `/mnt/smb/share/undercut/`; AAB and APK also on the Windows box `Downloads/`. The engine's generated release notes described Moonshot in two words outside the feature's vocabulary (one from the gambling register, one implying real money) — rewritten in all ten language files and the changelog to the vocabulary the feature ships with (a call, a stake, a reward; points or roster budget). Store copy is `release-notes-2.5.0.md`. The F-112 server/rules ops (OP-152 gate → OP-153 functions → OP-154 rules → OP-155 portal) are dry-run clean and pending the owner's apply; the gate op needs ≥ 2.3.2 live on every store first.
