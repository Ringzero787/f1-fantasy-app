# Sign-off uc-v2.5.2

Decision: **approve** — No blocking gate failed, no gate failed without a waiver, and all five waivers have substantive documented reasons; the enumerated hold conditions are not triggered by the evidence provided.

# Release sign-off: undercut 2.5.2

**Commit:** 566486d5  **Tag:** uc-v2.5.2  **Since:** uc-v2.5.1  **Notes:** .aidlc/releases/undercut-v2.5.2.md (translated 9/9)

## What shipped
- F-112, F-118, F-119
- CHANGELOG.md updated

## Gates run
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | advisory `npm run lint` failed (low, not waived, advisory only) |
| G04 | pass | — |
| G05 | pass | no security-relevant hunks; scanners only (shallow) |
| G07 | pass | trademark scan; no registry credentials (scanner-only) |
| G08 | pass | no regression |
| G10 | pass | — |
| G16 | pass | 9 languages in sync |

Not present in the verdict list: G01, G02, G06, G09, G11–G15. G06 and G14 have waivers on file but no verdict recorded for this commit.

## Waivers
1. **G05 — GHSA-\* (nathan, 2026-09-18, expires 2026-10-31).** Pre-existing functions lockfile advisories from F-027, untouched by this release. Acceptable: time-boxed and scoped to a lockfile this release does not change. Concern: matched by title, not path, so it is broader than it needs to be; expiry is close.
2. **G14 — Destructive OP-033 (nathan, 2026-09-24, owner approved).** Gen-1→gen-2 migration of pw-createPortalHandoff / pw-redeemPortalHandoff, which hold no data and are already broken in prod. OP-034 recreates them and is dry-run clean. Acceptable as a one-shot operational waiver; no expiry is tolerable because it is tied to a single op.
3. **G06 — Hydration-gated language apply (nathan, 2026-09-25).** False positive; LaunchReveal holds the native splash past the AsyncStorage read. Acceptable: evidence cited in bootstrap.ts and the F-079 spec with a fallback recorded.
4. **G16 — Plural form missing ICU syntax (nathan, 2026-09-25).** False positive; i18next suffix plurals under compatibilityJSON v4. Acceptable: gate prompt corrected upstream (G16@2).
5. **G07 — "Grand Prix" in new name (nathan, 2026-10-01).** Flagged strings are unit-test fixtures in fixRaceSchedules.test.js, not product naming; permitted as descriptive text by repo trademark policy. Acceptable; root cause filed as aidlc#9. The companion low finding (no USPTO/EUIPO credentials) correctly stays live as a warn.

All waivers have a reason. None are blanket or unexplained.

## Evidence gaps
- **SBOM:** `syft missing` — no SBOM diff produced for this release.
- **Artifact signatures:** no artifact list with signatures was present in the attached record; signing and reproducible-build hash could not be verified here.

## Residual risk
The main residual risk is evidentiary: without an SBOM or an attached artifact/signature list, this approval rests on gate verdicts and waivers only. G03 lint drift is unaddressed. The G05 waiver expires 2026-10-31 and must be followed by the actual dependency bump. G06/G14 show waivers but no verdicts for this commit. Trademark clearance remains scanner-only.

**RELEASE: approve** — no blocking gate failed and every waiver has a documented, defensible reason; attach the SBOM and signed artifact list before store submission.

## Residual risk
The main residual risk is evidentiary rather than code-level: the SBOM diff was not produced (syft missing) and the artifact list with signatures was not in the attached record, so this approval rests on gate verdicts and waivers alone and should not be treated as confirmation of signed, reproducible artifacts. G03 lint failed as an advisory and remains unaddressed, which is low-impact but means lint drift is accumulating. The G05 GHSA waiver is matched by title rather than path and expires 2026-10-31, after which the functions lockfile bump must actually land. G14 (destructive OP-033) and G06 have waivers on file but no verdicts in this release's gate list, so it is unclear whether those gates ran at all for 566486d5; the OP-033 recreate (OP-034) is dry-run clean but still a production deploy of previously non-functional gen-1 functions. The G07 trademark gate still has no USPTO/EUIPO credentials, so clearance of new names against Formula 1 / FIA marks is scanner-only, not registry-backed.
