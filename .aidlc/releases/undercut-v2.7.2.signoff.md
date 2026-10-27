# Sign-off uc-v2.7.2

Decision: **hold** — Artifact list is empty and SBOM/reproducible-build hash are absent, so artifact signatures and build reproducibility cannot be attested for the record.

# Release sign-off: Undercut 2.7.2 (f1-fantasy-app)

**Commit:** 76fc0062  **Tag:** uc-v2.7.2  **Since:** uc-v2.7.1  
**Notes:** .aidlc/releases/undercut-v2.7.2.md (translated 9/9)  **Changelog:** CHANGELOG.md  
**Stores:** google_play, apple, amazon  **Public-facing:** yes

## What shipped
The release notes and changelog are present and translated into all 9 languages. **The artifact list is empty (`shipped: -`)** — no APK/AAB/IPA/function bundles are enumerated, so nothing can be tied to a signature or a reproducible-build hash. The SBOM diff was not produced (`sbom: syft missing`).

## Gates run and depth
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | advisory `npm run lint` failed (non-blocking) |
| G04 | pass | — |
| G05 | pass | **scanners only** — no security-relevant hunks; ~75 advisories, all waived |
| G07 | pass | trademark; waiver on test-fixture 'Grand Prix' matches; gate has no USPTO/EUIPO credentials |
| G08 | pass | no regression |
| G10 | pass | — |
| G16 | pass | 9 languages in sync; plural-syntax waiver |

Not in the verdict list but referenced by waivers: **G14** (destructive op OP-033) and **G06** (hydration-gated language apply). It is not evidenced that these ran on 76fc0062.

## Waivers
- **G05 `GHSA-` (nathan, 2026-09-18, expires 2026-10-31)** — blanket by title prefix; covers every advisory across root, newgame and functions lockfiles, including highs in sharp, brace-expansion, ws, @grpc/grpc-js, node-forge, zod, body-parser, image-size, source-map-js. *Acceptable* only because this PR does not change the lockfiles and the waiver expires; *not acceptable* as a standing posture — the F-027 bump must land before expiry.
- **G14 OP-033 (2026-09-24, no expiry)** — delete/recreate of two gen-1 functions that are already non-functional in prod; OP-034 dry-run clean; owner approved. *Acceptable*; no expiry is fine for a one-shot operation.
- **G06 (2026-09-25)** — false positive, splash choreography covers the language load; evidence cited in code and spec. *Acceptable.*
- **G16 (2026-09-25)** — false positive, i18next suffix plurals vs ICU; gate prompt corrected upstream. *Acceptable.*
- **G07 (2026-10-01)** — false positive on unit-test fixtures; scanner path-scoping bug filed as aidlc#9; repo policy permits descriptive use of race names. *Acceptable*; the no-credentials warn remains live.

All five waivers have reasons. None of the hold criteria for waivers is triggered.

## Residual risk
If artifacts, signatures and SBOM are supplied and clean, remaining risk is the G05 blanket waiver over a large set of high advisories in Cloud Functions runtime dependencies, scanned at scanner-only depth and expiring 2026-10-31; plus unclear execution of G14/G06 on this commit, a failing (advisory) lint, and trademark clearance resting on repo policy rather than registry lookup.

## Decision
No blocking gate failed, no waiver is reason-less. But with zero artifacts listed and no SBOM or repro hash, the signature and reproducible-build criteria cannot be attested — a sign-off that asserts them would be false.

**RELEASE: hold** — artifact list is empty and SBOM/reproducible-build hash are missing, so artifact signatures and build reproducibility cannot be verified for the record. Re-run with artifacts attached; on gate and waiver evidence alone this release would approve.

## Residual risk
If the artifact list, signatures and SBOM are supplied and clean, the remaining risk is concentrated in the G05 blanket waiver: ~75 advisories (many high: sharp, brace-expansion, ws, @grpc/grpc-js, node-forge, zod, body-parser, image-size) are waived by title prefix 'GHSA-' as pre-existing in unchanged lockfiles, with G05 running scanners only because the diff had no security-relevant hunks. That is acceptable for a release that does not touch those lockfiles, but several (ws, grpc-js, body-parser, qs, node-forge) sit in the Cloud Functions runtime and the waiver expires 2026-10-31, so the dependency bump (F-027) must land before the next release or this waiver lapses. Secondary risks: the G14 destructive op (OP-033 gen-1 to gen-2 migration of two already non-functional functions) and G06 waivers reference gates that do not appear in the verdict list, so it is unclear they ran on this commit; lint is failing (advisory); and the G07 trademark gate has no USPTO/EUIPO credentials, so clearance of F1/Grand Prix marks rests on repo policy rather than registry checks.

## Hand-collected evidence (answers the hold, does not clear it)

Collected 2026-10-27 after the run and its `-g G13` retry, as for 2.5.1, 2.5.3, 2.7.0 and 2.7.1:
the gate holds on the absent artifact list, SBOM and reproducible-build hash, none of which the
pipeline produces for any Undercut release.

1. **Artifacts and signatures** — `undercut-v2.7.2.provenance.md`: sha256 and size of the AAB,
   the Amazon APK and the IPA; `jarsigner -verify` → `jar verified.` and the upload key's DN on
   the AAB; `apksigner` DN and certificate SHA-256 on the APK; `aapt2` versionCode 78 /
   versionName 2.7.2; Info.plist 2.7.2 / 62 on the IPA. No reproducible second build exists (the
   builds are not reproducible as configured) and syft is not installed, so the SBOM diff and the
   repro hash remain absent.
2. **Code in the cut** — one squash-merged PR on top of 2.7.1 (#238, `76fc006`), reviewed on this
   machine by the security and quality + spec readers (nothing HIGH; the one MEDIUM, the iOS
   swipe-back bypassing the unsaved-picks guard, fixed before merge). G05, G07 and G10 passed on
   this run with no finding.
3. **Device evidence** — the PR's own emulator run with the owner's account (reserve line, pick
   band, pills, partial-save summary, CANCEL and hardware-back guard, lineup untouched), and the
   Play artifact itself (universal APK from the AAB) launched and opened the picker on the same
   emulator; see the provenance.
4. **Bundle checks** — every bundle carries the Firebase web API key (the 2.7.0 lesson), the
   PR's `STILL OPEN` copy, and no demo-mode entry.
5. **GHSA waiver** expires 2026-10-31; nothing in this release changes the dependency set.
