# Sign-off uc-v2.7.1

Decision: **approve** — No blocking gate failed, every applied waiver has a stated reason, and nothing in the evidence shows an unsigned artifact or a reproducible-build hash mismatch; the remaining findings are warn-level and either waived, false positives, or feature-quality issues rather than release blockers.

# Release sign-off — undercut 2.7.1 (uc-v2.7.1)

**Scope:** F-130 weekend recap. Since uc-v2.7.0. Notes: `.aidlc/releases/undercut-v2.7.1.md`, CHANGELOG.md, translated 9/9 languages.

## Gates
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory `npm run lint` failed (low, non-blocking) |
| G04 | pass | — |
| G05 | warn | Full F-130 diff review: new scoped Firestore read, reused leaderboard read, defensive recap helpers, prefs state, signed-in config refetch, release-script key checks. Semgrep path-join hit = false positive (test file). ~70 GHSA advisories waived. Two feature-quality lows/infos remain. |
| G07 | warn | **No automated trademark search ran (no USPTO/EUIPO keys).** 'Grand Prix' waived (test fixtures). Unwaived: [high] Red Bull Racing, [medium] Carlos Sainz / Sainz, [medium] Mexico City Grand Prix. |
| G08 | pass | No regression |
| G10 | warn | Privacy: F-130 reads own team snapshots + league leaderboards under existing rules F-029/F-062; local recap-seen state only; no new SDKs. |
| G16 | pass | 9 languages in sync |

Not in the verdict set: G06, G14 (waivers exist for both but no run is recorded for this release).

## Waivers
- **G05 `GHSA-` (nathan, 2026-09-18, expires 2026-10-31)** — reason given: pre-existing F-027 advisories in the functions lockfile, untouched by this PR. *Acceptable with reservation:* the prefix match suppresses far more than the functions lockfile (vite/vitest/sharp/image-size/ws/zod appear to be app or tooling lockfiles). Still in window; bump must land before 10-31.
- **G14 OP-033 (2026-09-24)** — gen-1→gen-2 recreation of two non-functional, data-free portal-handoff functions; dry-run clean; owner approved. Acceptable. Not clearly part of this release.
- **G06 hydration-gated language apply (2026-09-25)** — splash held by LaunchReveal; evidence cited in code and spec. Acceptable false-positive waiver.
- **G16 plural ICU syntax (2026-09-25)** — i18next suffix plurals are correct; gate prompt fixed upstream. Acceptable; G16 passed anyway.
- **G07 'Grand Prix' (2026-10-01)** — matches are unit-test fixtures in `newgame/functions/scripts/fixRaceSchedules.test.js`; scanner lacks path scoping (aidlc#9); descriptive use permitted by repo policy. Acceptable. Note it only covers the watchlist hit, not Red Bull Racing / Sainz / Mexico City GP.

All waivers have a reason and author.

## Artifacts / SBOM / reproducibility
- SBOM diff: **not produced** (`syft missing`).
- Artifact list with signatures: **not present in the packet.**
- Reproducible-build hash: **not present in the packet.**
No unsigned artifact or hash mismatch is *reported*; none could be *confirmed*. Publisher must verify signatures before store upload.

## Open findings carried
1. G07 high: 'Red Bull Racing' no clearance; mediums on Sainz and Mexico City GP — likely descriptive race/driver data, needs a manual confirmation.
2. G05 blanket GHSA waiver broader than its justification; runtime functions deps (node-forge, body-parser, busboy, grpc-js) among them.
3. G05 low/info: `ensureSignedInConfig` no-op during in-flight fetch; unguarded leaderboard read hides recap permanently.
4. G03 lint advisory failing.

## Residual risk
Shipped code is low-risk and well reviewed; the residual risk sits in unverifiable packaging evidence (signatures, hash, SBOM absent), a too-broad dependency waiver that expires 10-31, and unconfirmed descriptive use of real F1 team/driver/event names in a public-facing app.

**RELEASE: approve** — no blocking gate failed, every waiver has a reason, and nothing in evidence shows an unsigned artifact or hash mismatch.

## Residual risk
The main residual risk is not in the shipped code (the F-130 diff was reviewed by G05 and G10 and is a scoped, read-only, sign-in-gated feature on data already governed by existing Firestore rules) but in what this packet could not prove. First, the artifact signature list, reproducible-build hash and SBOM diff were absent from the evidence, so the sign-off asserts only that no failure was reported, not that signing and reproducibility were confirmed; whoever publishes to Google Play, App Store and Amazon should confirm signatures before upload. Second, the G05 'GHSA-' waiver is a prefix match that silences roughly seventy advisories (including high-severity node-forge, body-parser, busboy, grpc-js, zod, sharp, brace-expansion, ws) across what look like several lockfiles, while its reason only justifies the functions lockfile from the F-027 bump; most are build/test-time (vite, vitest, sharp, image-size, source-map-js) but node-forge, body-parser, busboy and grpc-js are runtime in Cloud Functions, and the waiver expires 2026-10-31 so the bump must happen next release. Third, G07 obtained no automated trademark clearance (no USPTO/EUIPO keys) and left a high finding on 'Red Bull Racing' and mediums on 'Carlos Sainz'/'Sainz' and 'Mexico City Grand Prix' unwaived; these are almost certainly descriptive race/driver data of the same kind the Grand Prix waiver explains and are permitted by the repo's own policy as descriptive text, but that was inferred, not confirmed by a manual review, and for a public-facing fantasy app using real team and driver names this is an ongoing exposure rather than a 2.7.1-specific one. Finally, two low feature-quality issues (config refetch no-op while the startup fetch is in flight; unguarded leaderboard read can permanently hide the recap, contrary to the spec's fallback AC) and the failed lint advisory are shipped as-is.
