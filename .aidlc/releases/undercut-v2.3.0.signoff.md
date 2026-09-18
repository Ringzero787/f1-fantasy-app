# Sign-off uc-v2.3.0

Decision: **approve** — None of the four hold conditions is met: no blocking gate failed, the only waiver carries a reason/owner/expiry, and no unsigned artifact or repro-hash mismatch was reported. Approval is recorded against the evidence as presented; the missing SBOM and unattached signature/repro evidence are logged as residual risk and follow-ups rather than blockers.

# Release sign-off — Undercut (f1-fantasy-app) 2.3.0

**Commit:** d65fa5f4  **Tag:** uc-v2.3.0  **Since:** uc-v2.2.3  
**Notes:** .aidlc/releases/undercut-v2.3.0.md  **Changelog:** CHANGELOG.md  
**Stores:** Google Play, Apple, Amazon (public-facing)

## What shipped
F-048, F-050, F-051, F-052, F-053, F-054, F-055, F-057.

## Gates
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory check `npm run lint` failed — non-blocking |
| G04 | pass | — |
| G05 | pass | Reduced depth: "no security-relevant hunks; scanners only" |
| G07 | pass | — |
| G08 | pass | No regression |
| G10 | pass | — |

Only these six verdicts were attached; no other gate is recorded as having run for this release.

## Waivers
- **G05 / GHSA-\*** — by nathan, 2026-09-18, expires 2026-10-31. Reason: pre-existing dependency advisories in the functions lockfile (F-027 dependency-bump pass), untouched by this release; matched by title because CI reports absolute paths.  
  **Assessment:** acceptable — reasoned, owned, time-boxed, and G05 passed regardless. Caveat: the `GHSA-` prefix match is broad and would also suppress a *new* advisory in the same lockfile until expiry. The bump must actually happen before 2026-10-31.

## Evidence gaps
- **SBOM diff absent** — syft was not available, so no dependency delta since 2.2.3 exists for the record.
- **Artifact list / signatures not attached** — referenced in the sign-off request but not present in the evidence; no artifact is *reported* unsigned, but signing was not positively verified here.
- **Reproducible-build hash not attached** — no mismatch reported, no match verified.

## Residual risk
The risk is evidentiary rather than a known defect: without an SBOM diff, dependency changes across eight features cannot be independently audited; signing and reproducibility are inferred from the absence of a failure rather than from attached proof; G05 ran scanner-only on a release that includes Firebase Cloud Functions; and the GHSA- waiver could mask a newly introduced advisory until 2026-10-31. Lint is red (G03 warn) but non-blocking. Trademark exposure (F1/Grand Prix terms in a public store listing) is unchanged from 2.2.3 but was not re-verified by an attached gate.

## Follow-ups
1. Install syft in CI and regenerate/attach the SBOM for uc-v2.3.0 to the release notes.
2. Attach the signed artifact list and repro-build hash to `.aidlc/releases/undercut-v2.3.0.md`.
3. Complete the functions dependency bump before the waiver expires; narrow the waiver to specific GHSA IDs if it must be renewed.
4. Fix `npm run lint` so G03 returns to pass.

**RELEASE: approve** — no blocking gate failed, the sole waiver is reasoned and time-boxed, and no unsigned artifact or repro-hash mismatch was reported; evidence gaps (SBOM, signature list, repro hash) are logged as follow-ups, not blockers.

## Manual artifact verification (2026-09-18, build box; cosign and syft are not installed)

Shipped artifacts are the ones produced by the publishing run on commit 5fd6b2f (all three targets built, verified by their scripts and copied to `/mnt/smb/share/undercut/`; the gate then crashed recording the iOS artifact path, fixed in #61). The run recorded here (d65fa5f) rebuilt all three with `UC_SKIP_PUBLISH=1` to complete the gate record; d65fa5f differs from 5fd6b2f only in `.aidlc/aidlc.yaml`.

| Artifact | SHA-256 | Signature |
|---|---|---|
| `undercut-2.3.0-vc55.aab` (Play) | `6bd21b7c1b09846a9997399fa9cfb5a8c56c3dd8700182b78bd8687d4f3eb46d` | `keytool -printcert -jarfile`: CN=Nathan Shanks, OU=Mobile, O=Undercut; cert SHA-256 `70:EC:4C:19:…:16:CF:E7`, valid to 2053-07-08 |
| `undercut-2.3.0-vc55-amazon.apk` (Amazon) | `695854300939a296a38e86f5b2fa2c70a6695ca289b075d29b6871d113d5041b` | `apksigner verify --print-certs`: same Undercut certificate (`70ec4c19…5016cfe7`) |
| `undercut-2.3.0-build38.ipa` (App Store) | `88efbe154ddd6fac0270ced03c42ab811d9d29a469f9430da61a109a971b3876` | `codesign -dvv`: Apple Distribution: Nathan Shanks (MWVD9BU5VW), com.undercut.app; uploaded with altool — "UPLOAD SUCCEEDED with no errors", Delivery UUID `cff81f6e-5bb7-4906-9876-7e5d0198aee9` |

Also verified on a device: the 2.3.0 (versionCode 55) APK installed and ran on the Pixel 10 Pro XL emulator with the embedded Grid fonts.

Production operations for this release: OP-011 (constructor colours), OP-012 (F-054 functions), OP-013 (Firestore rules) — all applied 2026-09-18.
