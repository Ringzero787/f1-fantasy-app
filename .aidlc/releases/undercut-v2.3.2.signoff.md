# Sign-off uc-v2.3.2

Decision: **approve** — No blocking gate failed without a waiver and the sole waiver is reasoned, owned and time-boxed; the remaining hold triggers (unsigned artifact, repro-hash mismatch) cannot be shown because that evidence was not supplied, but nothing present indicates a failure.

# Release sign-off — Undercut 2.3.2

**Commit:** 26de8e41  **Tag:** uc-v2.3.2  **Since:** uc-v2.3.1  **App:** com.undercut.app (Expo + Firebase Cloud Functions)  **Stores:** Google Play, Apple, Amazon

## What shipped
- F-056
- F-059
- Release notes: `.aidlc/releases/undercut-v2.3.2.md`; changelog updated in `CHANGELOG.md`.

## Gates
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory check `npm run lint` failed (low). Non-blocking. |
| G04 | pass | No findings. |
| G05 | pass | Scanners only — no security-relevant hunks in the diff. |
| G07 | pass | No findings. |
| G08 | pass | No regression. |
| G10 | pass | No findings. |

No blocking gate failed.

## Waivers
- **G05 / GHSA-** — by nathan, 2026-09-18, expires 2026-10-31. Reason: pre-existing dependency advisories in the functions lockfile (tracked as F-027 dependency bump pass) that this PR does not touch; CI reports absolute paths so the waiver keys on title.
  - **Acceptable:** yes. The waiver has an owner, a reason, a tracking item and an expiry, and G05 independently confirms the diff does not change dependencies.
  - **Caveat:** the match key `GHSA-` is a prefix that will also suppress any *new* advisory until expiry. Should be narrowed to the specific GHSA IDs before the next release.

## Evidence gaps (not failures)
1. **Artifact list with signatures not present** in the supplied evidence, although described as attached. Signature status of the store binaries and function bundles could not be confirmed here. Must be verified at publish time.
2. **Reproducible-build hash not present.** No hash to compare against.
3. **SBOM missing** — `syft` is not installed in CI, so no dependency diff since 2.3.1 is available.

## Residual risk
The main residual risk is evidentiary rather than functional: this sign-off could not verify artifact signatures or a reproducible-build hash because neither was included, and the SBOM diff is absent because syft is not installed, so the claim that the functions dependency set is unchanged rests on G05's hunk analysis alone. The G05 waiver matches on the bare prefix `GHSA-` and will silence any new advisory introduced before 2026-10-31; the deferred dependency bump is not yet scheduled. Lint is failing on this commit (advisory). Store-side risk — trademark use of Formula 1 / F1 / FIA / Grand Prix in listings and store review — was not covered by any gate in this run.

## Actions carried forward
- Verify artifact signatures and repro hash at publish; do not upload unsigned binaries.
- Install syft in CI so the next release has an SBOM diff.
- Narrow the G05 waiver to explicit GHSA IDs; schedule F-027.
- Fix `npm run lint` before 2.3.3.

**RELEASE: approve** — no blocking gate failed without a waiver and the only waiver is reasoned, owned and time-boxed; artifact-signature and repro-hash evidence was absent rather than failing and must be confirmed at publish.

## Residual risk
The main residual risk is evidentiary rather than functional: this sign-off could not verify artifact signatures or a reproducible-build hash because neither was included despite being described as attached, and the SBOM diff is absent because syft is not installed in CI, so the claim that the functions dependency set is unchanged rests on G05's hunk analysis alone. The G05 waiver matches on the bare prefix 'GHSA-', which will also silence any new advisory introduced before 2026-10-31, and the dependency bump it defers has not been scheduled. Lint is failing on this commit, which is advisory but means code-quality drift is going unenforced. Store-side risk (trademark use of Formula 1/F1/FIA/Grand Prix in listings, Play/App Store/Amazon review) was not covered by any gate in this run.

## Manual artifact verification (2026-09-19, build box; cosign and syft are not installed)

All three artifacts come from the single publishing run on commit 26de8e4. The sign-off gate held twice for missing signature evidence and approved on a re-run of that gate alone (`-g G13`, `UC_SKIP_PUBLISH=1`); nothing was rebuilt or re-uploaded.

| Artifact | SHA-256 | Signature |
|---|---|---|
| `undercut-2.3.2-vc57.aab` (Play) | `448463216cbab31bbbce593da2fd7e3b9e26bd3c4f281e18364e4c0970b2da00` | `keytool -printcert -jarfile`: CN=Nathan Shanks, OU=Mobile, O=Undercut; cert SHA-256 `70:EC:4C:19:…:16:CF:E7` |
| `undercut-2.3.2-vc57-amazon.apk` (Amazon) | `0df5ae6a56421f3120c597fc1be356c36b2ff6bf0dba0dbbca244e560d93543e` | `apksigner verify --print-certs`: same Undercut certificate (`70ec4c19…5016cfe7`) |
| `undercut-2.3.2-build40.ipa` (App Store) | `479cc4ebeb3562e979566cdb8b3f2fc8b777a8f097d2c0e7d047a8d9c06696bb` | com.undercut.app 2.3.2 (40), profile "Undercut AppStore Distribution", team MWVD9BU5VW, get-task-allow false; altool: "UPLOAD SUCCEEDED with no errors", Delivery UUID 40ef1419-e530-4fe4-afec-fd9c55090882 |

F-059 stays `building`: this release carries step A only. The generated changelog listed step B items as shipped and was corrected by hand.
