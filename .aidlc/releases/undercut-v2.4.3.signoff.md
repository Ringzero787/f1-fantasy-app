# Sign-off uc-v2.4.3

Decision: **hold** — The artifact list with signatures and the reproducible-build hash were not included in the evidence (and the SBOM step reports 'syft missing'), so I cannot confirm that every artifact is signed or that the build reproduces — two of the four explicit hold conditions are unverifiable rather than satisfied. This is an evidence gap, not a defect: attach the signed artifact list, the repro hash comparison, and a generated SBOM diff and the release can be approved without re-running any gate.

# Release sign-off — Undercut 2.4.3 (f1-fantasy-app, com.undercut.app)

**Commit:** da2e8872 · **Tag:** uc-v2.4.3 · **Previous:** uc-v2.3.4 · **Stores:** Google Play, Apple, Amazon (public-facing)

## What shipped
22 features: F-059, F-060, F-068, F-070, F-073, F-075, F-077, F-079, F-083, F-084, F-085, F-086, F-087, F-088, F-090, F-091, F-092, F-093, F-094, F-095, F-097, F-098. Release notes at `.aidlc/releases/undercut-v2.4.3.md`, CHANGELOG updated, notes translated 9/9 languages. Infra op OP-118 (pitwall-pages-deploy) judged safe to apply.

## Gate results and depth
| Gate | Verdict | Depth / note |
|---|---|---|
| G03 | warn | advisory `npm run lint` failed (low) — non-blocking |
| G04 | pass | — |
| G05 | pass | **scanners only**; no security-relevant hunks reviewed |
| G07 | pass | trademark; no external registry credentials |
| G08 | warn | uc-ios_bytes +5.0% (28.07→29.49 MB), cause not attributed |
| G10 | pass | — |
| G14 | pass | OP-118 safe to apply |
| G15 | skip | no domain checks apply |
| G16 | pass | 9 languages in sync |

Not present in this verdict set: G01, G02, G06, G09, G11, G12, G13. No gate failed.

## Waivers
| Gate | Finding | Reason given | Assessment |
|---|---|---|---|
| G05 | `GHSA-` (title match) | Pre-existing functions-lockfile advisories from F-027; expires 2026-10-31 | Acceptable but **overly broad** — a prefix match on `GHSA-` suppresses any advisory, including new ones, until expiry. Should be narrowed to specific IDs. |
| G14 | Destructive OP-033 | Gen1→Gen2 migration of two non-functional, data-free functions; OP-034 recreates them; owner approved 2026-09-24 | Acceptable; one-time op, well evidenced. Not the op in this run. |
| G06 | Hydration-gated language apply | LaunchReveal holds native splash via preventAutoHideAsync; evidence cited in bootstrap.ts / F-079 spec | Acceptable; well-reasoned false positive. G06 not in this run's verdicts. |
| G16 | Plural form missing ICU syntax | i18next suffix plurals under compatibilityJSON v4; gate prompt fixed upstream (G16@2) | Acceptable; correct technical reasoning. |
| G07 | Watchlist mark "Grand Prix" in new name | Test fixtures only; real race data is descriptive text permitted by repo policy; scanner lacks path scoping (aidlc#9) | Acceptable; the low "no registry credentials" finding correctly left live. |

Every waiver has a reason and an author. One waiver (G14/OP-033) has no expiry, which is fine for a completed one-time op.

## Evidence gaps
- **Artifact list with signatures: not attached.** Cannot confirm every artifact is signed.
- **Reproducible-build hash: not attached.** Cannot confirm match.
- **SBOM: `syft missing`.** No SBOM diff since 2.3.4; dependency drift undocumented.

## Residual risk
Assuming signing and reproducibility evidence is produced, residual risk is low-to-moderate. The broad `GHSA-` waiver could mask a new advisory until 2026-10-31 and G05 ran at scanner depth only. The iOS bundle grew exactly 5% with no attributed cause. Lint is failing. Coverage from G06 and other unlisted gates for this commit is unknown. Trademark clearance is unverified against external registries. No SBOM exists for this release.

## Required to lift the hold
1. Attach the artifact list with signature verification for all store artifacts.
2. Attach the reproducible-build hash comparison.
3. Install syft and generate the SBOM diff vs uc-v2.3.4.
(No gate re-run needed.)

**RELEASE: hold** — artifact signatures and reproducible-build hash are absent from the evidence, so two hold conditions cannot be attested.

## Residual risk
Assuming the signing and reproducibility evidence is produced, residual risk is low-to-moderate. The G05 waiver matches any 'GHSA-' finding by title in the functions lockfile, which is broad enough to mask a newly introduced advisory until it expires on 2026-10-31; G05 itself ran at scanner depth only with no security-relevant hunks reviewed. The iOS bundle grew 5.0% (28.07→29.49 MB) with no attributed cause, sitting exactly on the warn threshold. The advisory lint check fails (G03), which is non-blocking but suggests the tree is not clean. G06 (and G01/G02/G09/G11–G13) do not appear in this commit's verdict list, so their coverage for this release is unknown. The trademark gate has no USPTO/EUIPO credentials, so clearance of any new naming is unverified; the 'Grand Prix' hit was correctly waived as test-fixture noise. No SBOM diff exists, so dependency drift since 2.3.4 is not documented.
