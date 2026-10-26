# Sign-off uc-v2.7.0

Decision: **hold** — The artifact list with signatures and the reproducible-build hash were not attached and the SBOM generation failed ('syft missing'); I cannot attest that every artifact is signed or that the build reproduces, which are explicit hold criteria for this sign-off.

# Release sign-off: undercut 2.7.0 (uc-v2.7.0)

## What shipped
- Version 2.7.0 (explicit), since uc-v2.6.0; commit da70ba11
- Features: F-119, F-125, F-126, F-127, F-128, F-129
- Notes: `.aidlc/releases/undercut-v2.7.0.md`, CHANGELOG.md; release notes translated 9/9 languages
- Operational change tied to this release: pw-createPortalHandoff / pw-redeemPortalHandoff deleted (OP-033) and recreated at Gen 2 (OP-034)

## Gates run and depth
| Gate | Verdict | Depth / note |
|---|---|---|
| G03 | warn | advisory `npm run lint` failed (low, non-blocking) |
| G04 | pass | — |
| G05 | pass | **scanners only**, no security-relevant hunks reviewed; ~70 advisories all waived |
| G07 | pass | trademark; 'Grand Prix' hit waived (test fixtures); gate has no USPTO/EUIPO credentials, so not a clearance |
| G08 | pass | no regression |
| G10 | pass | — |
| G16 | pass | 9 languages in sync; ICU plural finding waived |

Not in the bundle: G06, G14 (both have waivers applied but no verdict attached), and any other gate in the G01–G16 range. Either they did not run for this release or their verdicts were not attached; G14 in particular covers a destructive production op and its verdict should be on record.

## Waivers
1. **G05 – `GHSA-` (blanket, by title), expires 2026-10-31.** Reason: pre-existing advisories in the functions lockfile not changed by this PR; F-027 bump pass pending. *Acceptable with reservation*: has reason, owner and expiry, but (a) it is a prefix match that will waive any future advisory until expiry, (b) the stated scope (functions lockfile) does not match the findings, which include sharp, vite, vitest, image-size, source-map-js and brace-expansion from other lockfiles, and (c) several waived highs are runtime deps in public-facing Cloud Functions (node-forge, ws, @grpc/grpc-js, @fastify/busboy, body-parser, zod). 'This PR did not change it' is a PR-gate argument; at release time the code ships regardless. The bump must land before 2026-10-31.
2. **G14 – Destructive operation OP-033.** Reason: Gen1→Gen2 migration of two function names Firebase refuses to migrate in place; both hold no data and are already broken in prod (createCustomToken fails); OP-034 dry-run clean; owner approved 2026-09-24. *Acceptable.*
3. **G06 – Hydration-gated language apply.** Reason: false positive; LaunchReveal holds the native splash via preventAutoHideAsync until overlay paints; evidence cited in bootstrap.ts and F-079 spec with recorded fallback. *Acceptable.*
4. **G16 – Plural form missing ICU syntax.** Reason: false positive; i18next suffix plurals with compatibilityJSON v4, ICU would need a separate plugin; gate prompt corrected (G16@2). *Acceptable.*
5. **G07 – Watchlist mark 'Grand Prix' in new name.** Reason: both hits are unit-test fixtures in newgame/functions/scripts/fixRaceSchedules.test.js, never shipped; real race data does not match the regex; repo trademark policy permits descriptive use; scanner path-scoping gap filed as aidlc#9. *Acceptable*; the credentials-gap warn correctly stays live.

All waivers have a reason and an owner. No blocking gate failed without a waiver.

## What is missing
- **No artifact list and no signatures attached.** Cannot verify the 'any artifact is unsigned' criterion for google_play / apple / amazon artifacts.
- **No reproducible-build hash attached.** Cannot verify the hash-match criterion.
- **SBOM: `syft missing`.** No dependency diff since 2.6.0 is available, which also means the G05 waiver's claim that the lockfile is unchanged cannot be independently checked.

## Residual risk
If the artifacts are signed and reproducible, residual risk is moderate and concentrated in dependencies: ~70 waived advisories (~30 high) under one prefix-match waiver whose scope statement does not match the findings, with runtime-relevant packages shipping in public-facing Cloud Functions and the waiver expiring 2026-10-31. G05 depth was scanner-only. G06/G14 verdicts are absent; the G14 destructive op is mitigated by the functions being dataless and already non-functional. Lint is failing. Trademark pass is not a registry clearance.

## To lift the hold
1. Attach the artifact list with signatures for all three stores.
2. Attach the reproducible-build hash and its comparison result.
3. Re-run syft and attach the SBOM diff since uc-v2.6.0.
4. (Recommended, not blocking) attach G06 and G14 verdicts; correct the G05 waiver scope text.

**RELEASE: hold** — artifact signatures, reproducible-build hash and SBOM are absent from the bundle, so the signing and reproducibility hold criteria cannot be verified.

## Hand-collected evidence (answers the hold, does not clear it)

Artifact hashes, the signer of each of the three artifacts, the App Store Connect delivery UUID and in-binary content checks are in `undercut-v2.7.0.provenance.md`. The builds are not reproducible as configured, so there is no second hash to compare, and syft is not installed on the build box, so there is no SBOM. Same standing as 2.5.1 and 2.5.3.
