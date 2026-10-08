# Sign-off uc-v2.5.1

Decision: **hold** — The artifact list with signatures and the reproducible-build hash were not attached (and the SBOM diff is missing because syft is not installed), so the sign-off cannot attest that every artifact is signed or that the build reproduces — nothing is known to be wrong, but the record cannot say so.

# Release sign-off — undercut 2.5.1

**Tag:** uc-v2.5.1 (since uc-v2.5.0)  **Commit:** 997191e6  **Version:** 2.5.1 (explicit)
**Shipped:** F-112, F-113  **Notes:** .aidlc/releases/undercut-v2.5.1.md (translated 9/9)  **Changelog:** CHANGELOG.md

## Gates
| Gate | Verdict | Depth / note |
|---|---|---|
| G03 | warn | advisory check `npm run lint` failed (low) — advisory, not blocking, not waived |
| G04 | pass | — |
| G05 | pass | shallow: no security-relevant hunks, scanners only |
| G07 | pass | trademark; prior false positive on test fixtures waived 2026-10-01 |
| G08 | pass | no regression |
| G10 | pass | — |
| G14 | pass | OP-157 hosting-deploy: safe to apply |
| G15 | skip | no domain checks apply |
| G16 | pass | 9 languages in sync |

No gate failed. Depth was only reported by G05; other gates did not state depth.

## Waivers
- **G05 — GHSA-* in functions lockfile** (nathan, 2026-09-18, expires 2026-10-31): pre-existing advisories not touched by this change, tracked under F-027. Acceptable as time-boxed; the bump must land before expiry.
- **G14 — OP-033 destructive op** (nathan, 2026-09-24): gen-1→gen-2 migration of two already non-functional, data-free portal-handoff functions, recreated by OP-034. Acceptable; owner-approved and dry-run clean. Not an active finding in this run (G14 reports OP-157 only).
- **G06 — hydration-gated language apply** (nathan, 2026-09-25): false positive, splash held by LaunchReveal; evidence cited in bootstrap.ts and F-079. Acceptable. Note G06 is not in this run's verdict list.
- **G16 — plural ICU syntax** (nathan, 2026-09-25): false positive, i18next suffix plurals under compatibilityJSON v4; prompt fixed upstream (G16@2). Acceptable.
- **G07 — "Grand Prix" in new name** (nathan, 2026-10-01): false positive on unit-test fixtures only; descriptive use permitted by repo trademark policy; scanner path-scoping gap filed as aidlc#9. Acceptable. The companion "no USPTO/EUIPO credentials" low finding is correctly left live as a warn.

Every waiver has a reason and an author.

## Missing evidence
- **Artifact list with signatures: not attached.** Cannot confirm any artifact is signed.
- **Reproducible-build hash: not provided.** Cannot confirm the build reproduces.
- **SBOM diff: absent** (`sbom: syft missing`). No dependency delta since 2.5.0 is on record.

## Residual risk
Technically low — no security-relevant hunks, no regression, i18n complete, hosting deploy safe. Open functions-lockfile advisories are waived until 2026-10-31. G03 lint is advisory and unwaived. The real residual risk is provenance: for a public-facing app on three stores, signing and reproducibility are unverified at sign-off.

**RELEASE: hold** — the artifact signature list and reproducible-build hash were not attached, so the signing and reproducibility conditions cannot be attested; attach them (and install syft for the SBOM) and this can be approved on the same gate results.

## Residual risk
Code-level risk is low: G05 found no security-relevant hunks and ran scanners only, G08 shows no regression, G14's OP-157 hosting deploy is safe to apply, and G16 has all nine languages in sync for both the app and the release notes. The open dependency advisories in the functions lockfile remain under the G05 waiver until 2026-10-31 and must be bumped before the next release or the waiver lapses. The G03 lint failure is advisory and unwaived; it is unlikely to affect runtime but signals the branch was not lint-clean at tag time. The material residual risk is procedural, not technical: with no signature list, no reproducible-build hash and no SBOM, the release's provenance for three public stores (Google Play, Apple, Amazon) is unverified at sign-off time. Once those artifacts are attached and match, the remaining risk is confined to the known, time-boxed dependency advisories.
