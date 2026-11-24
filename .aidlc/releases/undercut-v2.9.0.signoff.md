# Sign-off uc-v2.9.0

Decision: **hold** — Artifact signatures and the reproducible-build hash cannot be verified because the artifact list was not in the evidence, and the SBOM diff is absent (syft missing); the record cannot assert that no artifact is unsigned.

# Release sign-off: f1-fantasy-app (Undercut) 2.9.0

**Commit:** 97bfcaea · **Tag:** uc-v2.9.0 · **Since:** uc-v2.8.0 · **Notes:** .aidlc/releases/undercut-v2.9.0.md (translated 9/9) · **Changelog:** CHANGELOG.md

## What shipped
F-146, F-147, F-148, F-149, F-150, F-151, F-152, F-157, F-163, F-167, F-168, F-169, F-170, F-171, F-174. Scope: Expo mobile app, Firebase Cloud Functions, Pit Wall web portal and worker, plus the shared Firestore rules/indexes/hosting this repo still owns for Track Limits.

## Gates
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | advisory `npm run lint` failed (low). Non-blocking. |
| G04 | pass | — |
| G05 | warn | **scanners only** — no security-relevant hunks, so no manual review. 4 high (all waived), ~20 medium unwaived. |
| G07 | pass | watchlist clean this release (G07 waiver from 2026-10-01 not needed). |
| G08 | pass | no regression. |
| G10 | pass | — |
| G16 | pass | 9 languages in sync. |
| G06, G14 | did not run | standing waivers exist but were not exercised this cycle. |

No blocking gate failed. No waiver lacks a reason.

## Waivers applied to this release (G05)
- **image-size@1.2.1 ×2** — build-time only via metro, reads repo-owned assets, not bundled. Fix needs image-size 2.x which drops the API metro uses. Acceptable; expires 2027-03-01 with the Expo SDK upgrade.
- **zod@3.25.76** — only @expo/cli, validating our own config on dev/build boxes. Fix is zod 4, unsupported by the CLI. Acceptable; same expiry.
- **decode-uri-component@0.2.2** — only reachable via query-string 7 under expo-router, whose parse path is commented out; worst case the opening user's own app hangs on a crafted link. Acceptable with a caveat: this reasoning depends on expo-router not re-enabling `getStateFromPath` parsing; re-check at the SDK upgrade. Same expiry.

Standing waivers (G14 OP-033 gen-1→gen-2 function recreation, G06 LaunchReveal splash hold, G16 i18next suffix plurals, G07 test-fixture "Grand Prix") all have concrete reasons; G14 has no expiry but is a one-shot migration already completed.

## Unwaived findings
Mediums in glob, minimatch, uuid (7/9/10), ts-deepmerge, @vitest/mocker, vitest and qs@6.14.3. Mostly tooling; **qs** is the one to triage since it may sit under express in Cloud Functions.

## Evidence gaps
- **Artifact list / signatures: not present in the evidence.** Cannot assert any artifact is signed.
- **Reproducible-build hash: not provided.** Cannot assert it matches.
- **SBOM: `syft missing`** — no SBOM diff to review.

## Residual risk
Gate-wise this is a low-risk release: the waived highs are build/dev-time or self-only deep-link DoS, all expiring with the Expo SDK upgrade; G05 was scanners-only; lint is red as an advisory. The material unknown is provenance — without signatures, repro hash and SBOM the shipped binaries cannot be tied to commit 97bfcaea.

**RELEASE: hold** — artifact signatures and the reproducible-build hash could not be verified because the artifact list was absent from the evidence (and the SBOM was not generated); attach them and this becomes an approve with no further gate work.

## Residual risk
Gate-wise the release is low risk: no blocking gate failed, the waived highs are all build/dev-time (metro, @expo/cli) or a deep-link self-DoS with no server or cross-user impact, and all four are tied to the Expo SDK upgrade with a 2027-03-01 expiry. Unwaived mediums remain in glob, minimatch, uuid, ts-deepmerge, vitest and qs@6.14.3; of these only qs plausibly sits in a runtime path (Cloud Functions via express) and should be bumped or explicitly triaged next release. G05 ran scanners-only (no security-relevant hunks), G03 lint is failing as an advisory, and G14/G06 did not run this cycle so their standing waivers were not exercised. The material unknown is supply-chain provenance: without the artifact list, signatures, repro hash and SBOM, the release cannot be tied to the audited commit 97bfcaea.
