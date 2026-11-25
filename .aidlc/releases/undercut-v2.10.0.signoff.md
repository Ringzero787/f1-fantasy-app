# Sign-off uc-v2.10.0

Decision: **hold** — No artifact list or signatures and no SBOM were attached (sbom: syft missing); the sign-off cannot attest that artifacts are signed or that the reproducible-build hash matches, which are hold conditions I cannot clear on the evidence provided.

# Release sign-off — Undercut 2.10.0 (uc-v2.10.0, 1242a1cd)

## What shipped
- Features: F-155, F-171, F-175, F-176
- Notes: `.aidlc/releases/undercut-v2.10.0.md`, CHANGELOG.md, translated 9/9 languages
- Version 2.10.0 explicit, since uc-v2.9.0

## Gates
| Gate | Verdict | Notes |
|---|---|---|
| G03 | warn | advisory: `npm run lint` failed (low) |
| G04 | pass | — |
| G05 | warn | no security-relevant hunks; scanners only. 4 high advisories waived, ~20 medium unwaived |
| G07 | pass | — |
| G08 | pass | no regression |
| G10 | pass | — |
| G16 | pass | 9 languages in sync |

G06 and G14 did not run for this commit (waivers on file for both are from earlier releases).

## Waivers applied to this release
- **image-size@1.2.1 (GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr)** — build-time only, consumed by metro reading repo-owned assets; not in bundle. Fix needs Expo SDK upgrade. Expires 2027-03-01. **Acceptable.**
- **zod@3.25.76 (GHSA-mrhx-c7xc-m3w5)** — only @expo/cli, validating this repo's own config on dev/build boxes. Fix is zod 4, unsupported by Expo CLI. Expires 2027-03-01. **Acceptable.**
- **decode-uri-component@0.2.2 (GHSA-qr28-fpjm-wq7f)** — reachable only via query-string 7 under expo-router; parse path is commented out upstream so a deep link is not expected to reach it; worst case is a hang on the device of the user who opened the crafted link. Fix is ESM-only, needs expo-router major. Expires 2027-03-01. **Acceptable with a caveat**: the argument rests on a commented-out call in a third-party package; re-verify on the Expo SDK upgrade and do not renew this waiver without re-checking.

Carried waivers not exercised by this run: G14/OP-033 (gen-1→gen-2 function recreate, owner-approved, no expiry), G06 hydration-gated language apply (no expiry), G16 plural ICU (gate prompt fixed upstream), G07 "Grand Prix" in test fixtures (filed aidlc#9). All have reasons; none affect this build.

## Evidence gaps
- **Artifact list with signatures: not attached.** Cannot verify any artifact is signed.
- **SBOM: `syft missing`.** No SBOM diff; no reproducible-build hash to compare.

## Residual risk
See `residual_risk`. In short: unwaived medium advisories (notably qs) with unstated runtime reach, a failing lint advisory, and three waived build-tool highs that roll off with the Expo SDK upgrade.

## Decision
**RELEASE: hold** — the artifact list/signatures and the SBOM are absent, so artifact signing and the reproducible-build hash cannot be attested. Everything else in this record is approvable; attach those two items and this becomes an approve.

## Residual risk
If the artifact list and SBOM are supplied and check out, the residual risk is a known tail of unwaived medium advisories in G05 (qs x4, uuid, minimatch, glob, ts-deepmerge, vitest/mocker) whose runtime reach has not been stated — qs in particular may sit in the Cloud Functions request path and should be confirmed; the four waived highs are confined to metro, @expo/cli and expo-router's query-string dependency, with the worst credible outcome a self-inflicted client hang from a crafted deep link, and all four roll off with the Expo SDK upgrade before 2027-03-01; lint is failing as an advisory and should be fixed before it masks a real regression; the G14 and G06 waivers predate this release, have no expiry, and apply to gates that did not run here, so they carry no risk for this build but should be given expiries or retired.

## Hand verification (2026-11-25), answering the G13 evidence gap

G13 held on missing evidence, not a failed check. This unit has no artifact globs, cosign or syft, so the sign-off never sees the artifacts. The checks below were made by hand on the files on the share.

| Artifact | sha256 | Signer / identity | Version | Firebase key in bundle |
|---|---|---|---|---|
| undercut-2.10.0-vc81.aab | 55ed44b8ef0b53bb8a8e6acbc45c6961d4e520075df9b21fa63d7dc8b504c426 | CN=Nathan Shanks, O=Undercut; SHA-256 70ec4c19…cfe7 | 2.10.0 / 81 | yes |
| undercut-2.10.0-vc81-amazon.apk | 5dfa20694bd65e038e94fed02a3a0eca51910f298c58819d9023a3a7007d4022 | apksigner SHA-256 70ec4c19…cfe7 | 2.10.0 / 81 | yes |
| undercut-2.10.0-build65.ipa | 9e44cabe3d5ac7de94b53e68e21212fcfe58297d4127e296d750c6b2502dd46c | com.undercut.app; uploaded by altool, delivery 8a330c8a-64b8-4c84-9cc3-3500c160a533 | 2.10.0 / 65 | yes |

Launch test: the Amazon APK was installed over a signed-in 2.9.0 on the gamer emulator. It launched signed in on live data (Lusail, round 24, "locks in 3d 1h"), with an empty crash buffer.

Not evidenced: these builds are not reproducible as configured, so there is no second hash to compare.

The G13 run also exited on the engine's 200-character title limit (aidlc#6).
