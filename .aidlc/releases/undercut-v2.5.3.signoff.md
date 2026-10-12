# Sign-off uc-v2.5.3

Decision: **approve** — No blocking gate failed, every waiver has a documented reason, and the change set is metadata-only; none of the stated hold triggers is met on the evidence attached.

# Release sign-off — Undercut (f1-fantasy-app) v2.5.3

**Tag:** uc-v2.5.3 · **Commit:** 8b6d9378 · **Since:** uc-v2.5.2 · **Signed by:** release judgment role

## What shipped
- Features: F-091, F-108, F-120 (per `.aidlc/releases/undercut-v2.5.3.md`, `CHANGELOG.md`).
- Release commit content: features.yaml, spec status, perf baseline, localized release notes (9/9 languages in sync), provenance, sign-off, CHANGELOG, store copy, and the version/buildNumber/versionCode bump in `app.config.js`.
- **No** application or Cloud Functions code, permission, entitlement, network, crypto, auth or dependency changes in the diff (G05 full-hunk review).

## Gates run and depth
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | **warn** | Advisory `npm run lint` failed (low). Advisory only, non-blocking. |
| G04 | pass | No findings. |
| G05 | pass | All hunks reviewed; secrets scan of provenance text (only public fingerprints, team ID, UUIDs, share paths). ~60 dependency advisories reported, all waived under the `GHSA-` waiver; one info finding on waiver posture. |
| G07 | pass | Trademark watchlist — no live findings; prior "Grand Prix" test-fixture waiver on record. |
| G08 | pass | No perf regression against baseline. |
| G10 | pass | Privacy review — no personal-data code paths touched. |
| G16 | pass | 9 languages in sync; prior ICU-plural false-positive waived. |

Gates not in this verdict set (e.g. G06, G14) have standing waivers applied but did not report on this commit.

## Waivers applied
1. **G05 / `GHSA-` (nathan, 2026-09-18, expires 2026-10-31)** — Pre-existing advisories in the functions lockfiles, unchanged by this release; waiver by title because CI reports absolute paths. *Acceptable with reservation:* reason and expiry are present and the release does not touch those lockfiles, but the title-match is blanket and covers high-severity runtime deps (ws, @grpc/grpc-js, node-forge, @fastify/busboy, brace-expansion). G05 itself flags that it will absorb new advisories until expiry. The F-027 bump must land before 2026-10-31 or this waiver should not be renewed as-is.
2. **G14 / Destructive OP-033 (nathan, 2026-09-24)** — Gen-1→Gen-2 migration of `pw-createPortalHandoff` / `pw-redeemPortalHandoff`; functions hold no data and are already non-functional (gen-1 SA cannot `createCustomToken`). OP-034 dry-run clean, recreates both. Owner approved. *Acceptable:* no data at risk, no working functionality lost.
3. **G06 / Hydration-gated language apply (nathan, 2026-09-25)** — False positive; LaunchReveal holds the native splash via `preventAutoHideAsync()` well past the AsyncStorage read. Evidence cited in `bootstrap.ts` and F-079. *Acceptable.*
4. **G16 / Plural ICU syntax (nathan, 2026-09-25)** — False positive; i18next suffix plurals under compatibilityJSON v4, gate prompt corrected upstream (G16@2). *Acceptable.*
5. **G07 / "Grand Prix" in new name (nathan, 2026-10-01)** — False positive on unit-test fixtures in `newgame/functions/scripts/fixRaceSchedules.test.js`; never shipped, and descriptive use is permitted by repo trademark policy. Scanner path-scoping gap filed as aidlc#9. *Acceptable.* The accompanying low finding (no USPTO/EUIPO credentials) remains live as a warn — a clearance gap, not a clearance.

Every waiver has a reason, author and date. None is blank.

## Evidence gaps (not hold triggers, but recorded)
- **SBOM:** `syft missing` — no SBOM diff was produced for this release.
- **Artifact signatures:** no artifact list was attached to this sign-off; signatures could not be independently verified.
- **Reproducible-build hash:** not attached; could not be compared.
These are unverified, not failed. Given the diff is metadata-only this is tolerated for 2.5.3, but should be fixed in the pipeline before the next code-bearing release.

## Residual risk
The dominant residual risk is the blanket `GHSA-` title-match waiver on G05, covering ~60 advisories including high-severity Cloud Functions runtime dependencies, scoped only by its 2026-10-31 expiry and silently absorbing any advisory published before then. Secondary: artifact signatures, reproducible-build hash and SBOM were absent from the record and are unverified; the G14 destructive op is well-justified but its follow-up OP-034 should be confirmed executed; G03 lint remains failing as an advisory warning.

---
`RELEASE: approve` — no blocking gate failed, every waiver carries a documented reason, and the shipped diff is metadata-only with no code, permission or dependency changes.

## Residual risk
The dominant residual risk is the blanket 'GHSA-' title-match waiver on G05, which absorbs roughly 60 advisories across the lockfiles — including high-severity runtime dependencies for Cloud Functions (ws@8.20.0, @grpc/grpc-js@1.9.16, node-forge@1.4.0, @fastify/busboy@3.2.0, brace-expansion@1.1.14) alongside build/dev-only ones (vitest, image-size, source-map-js, sharp). It is scoped by expiry (2026-10-31) and the release does not alter those lockfiles, but it also silently covers any advisory published between now and then. Secondary risk: this sign-off could not independently verify artifact signatures or a reproducible-build hash because neither was attached, and no SBOM diff exists for this release; a sign-off on a metadata-only diff tolerates that, but the gap should be closed before the next code-bearing release. The G14 waiver (destructive OP-033 deleting two gen-1 functions) is well-reasoned — the functions hold no data and are already broken in production — and OP-034 recreates them, but it is an operational step outside this gate set and should be confirmed executed. G03 lint remains failing as an advisory warning.
