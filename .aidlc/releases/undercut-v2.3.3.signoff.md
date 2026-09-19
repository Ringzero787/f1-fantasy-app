# Sign-off uc-v2.3.3

Decision: **approve** — No blocking gate failed, the single waiver is reasoned and time-boxed, and no artifact is shown unsigned or hash-mismatched; the only warn is an advisory lint check.

# Release sign-off: undercut 2.3.3

**Project:** f1-fantasy-app / Undercut (com.undercut.app)  
**Version:** 2.3.3 (explicit) since uc-v2.3.2  
**Tag:** uc-v2.3.3  
**Commit:** de0c1be5  
**Stores:** google_play, apple, amazon  
**Notes:** .aidlc/releases/undercut-v2.3.3.md, CHANGELOG.md

## What shipped
- F-059
- F-067

## Gates
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | advisory check failed: `npm run lint` (low, non-blocking) |
| G04 | pass | no findings |
| G05 | pass | no security-relevant hunks; scanners only |
| G07 | pass | no findings |
| G08 | pass | no regression |
| G10 | pass | no findings |

No blocking gate failed. G05 ran at scanner-only depth because the diff contained no security-relevant hunks.

## Waivers
- **G05 / GHSA-*** — by nathan, 2026-09-18, expires 2026-10-31. Reason: pre-existing dependency advisories in the functions lockfile (tracked as F-027 dependency bump), not changed by this PR; matched by title because CI reports absolute paths.
  - Assessment: acceptable. It has an owner, a stated reason, a tracking item, and an expiry that forces revisit. Concern noted: the `GHSA-` prefix match is broad and would also suppress any newly introduced advisory. G05 reported no findings this release so the waiver was not actually exercised, but the scope should be narrowed to specific advisory IDs before renewal.

## Evidence gaps
- **SBOM:** syft missing — no SBOM generated, no dependency diff since 2.3.2 available for review.
- **Artifact signatures:** referenced as attached but not present in the packet; not independently verified in this sign-off.
- **Reproducible-build hash:** not present in the packet; not independently verified.

None of these is a hold condition under the stated rules (no artifact is shown unsigned, no hash is shown mismatched), but they are recorded so the record is honest about what this approval rests on.

## Residual risk
The release carries known gaps rather than known defects: no SBOM means the GHSA waiver cannot be cross-checked against the real lockfile and a broad title-prefix waiver could mask a new advisory; artifact signing and reproducibility are asserted by passing gates rather than confirmed from an attached artifact list; and lint did not complete. Given public exposure on three stores, the person uploading binaries should confirm signatures on the actual artifacts before publishing, and syft should be restored before the next release.

## Follow-ups
1. Install syft in CI and regenerate the 2.3.3 SBOM post hoc; attach to the release notes.
2. Fix `npm run lint` failure before 2.3.4.
3. Narrow the G05 waiver to explicit GHSA IDs; complete F-027 before 2026-10-31.
4. Attach the artifact signature list and repro hash to the release record.

**RELEASE: approve** — no blocking gate failed and the only waiver is reasoned and time-boxed.

## Residual risk
The release carries three known gaps rather than known defects. First, no SBOM was produced (syft missing), so the dependency diff since 2.3.2 cannot be reviewed and the GHSA waiver cannot be checked against the actual lockfile contents; the waiver is also matched by title prefix 'GHSA-', which is broad enough to mask a new advisory if one were introduced, though G05 itself reported no findings this release. Second, the artifact list with signatures and the reproducible-build hash were referenced but not included in the evidence packet, so signing and reproducibility are asserted by the passing gates rather than independently confirmed here; store submission should not proceed until whoever uploads the binaries confirms signatures on the actual .aab/.ipa/.apk. Third, G03 lint failed in advisory mode, which is low risk in itself but means a class of static checks did not run to completion on this build. Public-facing exposure across Google Play, Apple, and Amazon means any of these, if they conceal a real problem, would surface to users rather than in CI.

## Manual artifact verification (2026-09-19, build box; cosign and syft are not installed)

All three artifacts come from the single publishing run on commit de0c1be; the sign-off approved on that run.

| Artifact | SHA-256 | Signature |
|---|---|---|
| `undercut-2.3.3-vc58.aab` (Play) | `b67ab58898cdbec8977701fe61096188a832e8fd3906a46e58e7720bb9cd09aa` | `keytool -printcert -jarfile`: CN=Nathan Shanks, OU=Mobile, O=Undercut; cert SHA-256 `70:EC:4C:19:…:16:CF:E7` |
| `undercut-2.3.3-vc58-amazon.apk` (Amazon) | `aa1e593abac193eedf3d5c9279eb825fdc211dc35e6855a33227a01b4040cba4` | `apksigner verify --print-certs`: same Undercut certificate (`70ec4c19…5016cfe7`); installed on the Pixel 10 Pro XL emulator, launcher shows the new U-mark icon |
| `undercut-2.3.3-build41.ipa` (App Store) | `7bcd2bf8c6c728f9aeadee1a75c8f5b72de491a5135c74a97152a115fe3d823e` | com.undercut.app 2.3.3 (41), profile "Undercut AppStore Distribution", team MWVD9BU5VW, get-task-allow false; altool: "UPLOAD SUCCEEDED with no errors", Delivery UUID 2f24ab7e-e7b2-46e4-a9d1-edc339ef85db |

The launch reveal was verified on an Android release build before the release (`docs/design/grid/verify/F-067-launch-reveal-android.png`); it has not been exercised on an iOS device. The generated changelog listed F-059 step B items as shipped and was corrected by hand; F-059 stays `building`.
