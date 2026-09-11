# Sign-off tl-v0.1.43

Decision: **approve** — No blocking gate failed, no waivers exist (so none lack a reason), and no evidence of an unsigned artifact or reproducible-build hash mismatch was presented; G03 findings are advisory and low-severity by gate classification.

# Release sign-off: Track Limits 0.1.43

**Project:** f1-fantasy-app / Track Limits (`newgame/`, com.tracklimits.app)  
**Tag:** `tl-v0.1.43` (commit `76dde1a2`), since `tl-v0.1.42`  
**Notes:** `.aidlc/releases/tracklimits-v0.1.43.md` · **Changelog:** `newgame/CHANGELOG.md`  
**Stores:** Google Play, Apple, Amazon

## What shipped
Features F-014, F-037, F-038, F-039, F-040.

## Gate results
| Gate | Verdict | Depth / notes |
|------|---------|---------------|
| G03 | **warn** | Advisory checks failed: `npm run lint`, `npx tsc --noEmit`, `npm test -- --ci` (3 × low, advisory) |
| G04 | pass | no findings |
| G05 | pass | Shallow — no security-relevant hunks; scanners only |
| G07 | pass | no findings |
| G08 | pass | No regression |
| G10 | pass | no findings |

No blocking gate failed.

## Waivers
None applied. Nothing to assess for missing rationale.

## Findings not covered by a gate
1. **SBOM absent** — `syft missing`; no SBOM diff since 0.1.42 could be produced. Dependency/licence/vuln drift is unaudited for this release.
2. **Artifact signatures not in evidence** — the task states an artifact list with signatures was attached, but the evidence bundle contains no artifact entries. Signature status could not be independently confirmed.
3. **Reproducible-build hash not in evidence** — no hash pair to compare; the mismatch hold-criterion could not be evaluated.
4. **All three advisory checks failed at G03** — lint, typecheck and tests all failing together suggests either a real quality regression or the commands running against the wrong workspace (repo root vs `newgame/`). Either way, automated correctness evidence for this release is weak.

## Residual risk
The release goes out with lint, type-check, and the unit test suite all reporting failure at the advisory G03 gate, so correctness of the five shipped features rests on G08's no-regression verdict and review rather than the project's own automated checks. With syft missing there is no SBOM diff, so dependency additions, licence changes, and newly vulnerable packages since 0.1.42 are unaudited. Because the artifact list, signatures, and reproducible-build hash were not present in the evidence bundle, this approval relies on the pipeline's default signing behaviour rather than confirmed signatures; if a downstream step finds an unsigned store artifact this sign-off should be treated as void.

## Follow-ups (non-blocking)
- Install `syft` in the release runner and regenerate the SBOM for 0.1.43 post hoc.
- Attach artifact list + signatures and the repro-build hash to the evidence bundle so future sign-offs can evaluate those criteria.
- Fix the G03 advisory failures (or the workspace they run in) before 0.1.44.

---
**RELEASE: approve** — no blocking gate failed, no waivers exist, and no evidence of an unsigned artifact or reproducible-build mismatch was presented; G03 failures are advisory/low by gate classification.

## Residual risk
The release goes out with lint, type-check, and the unit test suite all reporting failure at the advisory G03 gate, meaning correctness of the five shipped features rests on G08's no-regression verdict and reviewer judgment rather than the project's own automated checks; because syft was missing there is no SBOM diff, so dependency additions, license changes, and newly introduced vulnerable packages since 0.1.42 are unaudited for this release; and because the artifact list, signatures, and reproducible-build hash were not actually included in the evidence bundle, this approval is conditional on the release pipeline's default signing behaviour rather than on independently confirmed signatures — if a downstream step finds an unsigned store artifact, this sign-off should be treated as void.
