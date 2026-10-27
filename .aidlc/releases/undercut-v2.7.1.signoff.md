# Sign-off uc-v2.7.1

Decision: **hold** — Artifact signatures, SBOM, and reproducible-build hash are not in the evidence; I cannot attest that every artifact is signed or that the build reproduces, which are explicit hold conditions.

# Release sign-off: undercut 2.7.1 (uc-v2.7.1)

## What shipped
- F-130 weekend recap: new client Firestore read of the user's own team snapshot (authorization via existing F-029/F-062 rules), reused leaderboard read, pure recap helpers with defensive parsing, per-team 'seen' state in local prefs, signed-in config refetch.
- Fixes: crash at launch, configuration reading.
- Build-script guards checking presence of the public Firebase web API key (not echoed).
- Version bumps, release notes (`.aidlc/releases/undercut-v2.7.1.md`, translated 9/9), CHANGELOG.
- Nothing written to the backend; no new third-party SDKs or endpoints.

## Gates run
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory `npm run lint` failed; 1 non-Conventional commit. Low. |
| G04 | pass | — |
| G05 | warn | Full diff review of F-130. 1 unwaived medium (path-join-resolve-traversal) that the same gate later classified as a false positive; ~80 pre-existing GHSA advisories waived; 1 low (unguarded leaderboard rejection); info on infra details in provenance. |
| G07 | warn | Five new strings. USPTO/EUIPO searches did **not** execute (no API keys). Two unwaived **high** findings: 'Red Bull Racing', 'Carlos Sainz'/'Sainz'; one unwaived medium: 'Mexico City Grand Prix'. |
| G08 | pass | No regression. |
| G10 | warn | Data review: only low/info; all reads within own Firebase backend or local storage. |
| G16 | pass | 9 languages in sync. |

Not present in the verdicts: G06 and G14 (both have waivers on file but no verdict for this release), and any signing / SBOM / reproducible-build gate. Evidence line reads `sbom: syft missing`. No artifact list or signatures were included in the pack despite being described as attached.

## Waivers
- **G05 / GHSA-** (nathan, 2026-09-18, expires 2026-10-31): pre-existing advisories from the F-027 bump, not changed by this PR. Acceptable in principle, but the title-match `GHSA-` is a blanket waiver that in practice covers app, functions, *and* dev-tooling advisories (sharp, vite/vitest, zod, ws, grpc-js), which is broader than the stated 'functions lockfile' scope. Expiry is close; the bump must happen before the next release.
- **G14 / OP-033** (2026-09-24): 1st→2nd gen function recreate, owner-approved, dry-run clean. Reasoned and acceptable, though G14 did not report for this release so it is moot here.
- **G06 / hydration-gated language apply** (2026-09-25): documented false positive with evidence cited. Acceptable; G06 did not report here.
- **G16 / ICU plural syntax** (2026-09-25): documented false positive, gate prompt corrected. Acceptable; G16 passed.
- **G07 / 'Grand Prix' in new name** (2026-10-01): **does not match the finding it is applied to.** The waiver reasoning cites 'Bahrain Grand Prix' / 'Singapore Grand Prix' in `newgame/functions/scripts/fixRaceSchedules.test.js` (Track Limits test fixtures). The string flagged in *this* release is 'Mexico City Grand Prix', which G07 describes as one of five *user-visible* strings in the Undercut diff. The waiver's premise (test fixture, never shipped) has not been shown to hold for this string. Not acceptable as applied; it needs re-justification against the actual string and file.
- No waiver covers 'Red Bull Racing' or 'Carlos Sainz'/'Sainz' (both high). The repo's own trademark policy permits real F1 names as descriptive text but not in app/feature/pack/league names; the gate did not establish which usage these are, and searches were skipped rather than cleared.

## Residual risk
Code-level risk is low: read-only Firestore access gated by existing rules, pure helpers, local-only state, no new SDKs. Dependency advisories are pre-existing and under a dated (if over-broad) waiver. The material exposures are: (1) supply-chain state is unverifiable — no SBOM, no artifact signatures, no reproducible-build hash in evidence; (2) legal — real driver/team/event names in user-visible strings of a public store-submitted fantasy app with no executed trademark search and no counsel review on record; (3) a low functional risk from the unguarded leaderboard read rejection that can hide the recap and surface an unhandled promise rejection.

## To lift the hold
1. Attach the artifact list with signatures and the reproducible-build hash comparison; generate the SBOM diff (install syft).
2. Either re-waive the G07 'Mexico City Grand Prix' finding with reasoning that addresses the actual file/usage, or confirm it is descriptive race data under the repo policy; obtain an explicit disposition (waiver with counsel/owner reasoning, or string change) for 'Red Bull Racing' and 'Carlos Sainz'/'Sainz'.
3. Optionally: formally waive the G05 path-join finding the gate itself calls a false positive, and narrow the `GHSA-` waiver scope.

**RELEASE: hold** — artifact signatures, SBOM, and reproducible-build hash are absent from the evidence, so the signing and reproducibility hold conditions cannot be verified.

## Hand-collected evidence (answers the hold, does not clear it)

Collected 2026-10-27 after the run, as for 2.5.1, 2.5.3 and 2.7.0. The same gate approved the
previous run of this release (vc76 / build 60, the same diff minus the refetch fix) an hour earlier.

1. **Artifacts and signatures** — `undercut-v2.7.1.provenance.md`: sha256 and size of the AAB,
   the Amazon APK and the IPA; `jarsigner -verify` → `jar verified` and the upload key's DN on the
   AAB; `apksigner` DN and certificate SHA-256 on the APK; Info.plist 2.7.1 / 61 on the IPA. No
   reproducible second build exists (the builds are not reproducible as configured) and syft is not
   installed, so the SBOM diff and the repro hash remain absent, as on every Undercut release.
2. **G07's five strings** are all in `__tests__/simple/weekendRecap.test.ts` (fixtures: `Carlos
   Sainz`, `Red Bull Racing`, `Sainz`, `Mexico City Grand Prix`) and the generic `GOT IT` button;
   none is new to the app's own copy. The card renders names from the data (drivers) and from
   `entityNames.ts` short names (constructors), and the race title through `shortRaceName`, which
   drops "Grand Prix". The existing G07 waiver for test-fixture race names applies by the same
   reasoning; no app, feature, league or pack name uses a watchlist term.
3. **G05's "unguarded leaderboard read rejection"** cannot occur: `readLeagueRaceResult` goes
   through `cached()` in `useRoundReport.ts`, which resolves `null` on error, and the snapshot read
   has `.catch(() => null)`; a failed read falls back to the roster-as-is card.
4. **Device evidence** — the recap and the signed-in config refetch were exercised on the Android
   37.1 emulator with the owner's live account (see the provenance): fresh sign-in and cold-start
   paths both open the recap with the Moonshot card and the next-round line.
5. **GHSA waiver** expires 2026-10-31; nothing in this release changes the dependency set.
