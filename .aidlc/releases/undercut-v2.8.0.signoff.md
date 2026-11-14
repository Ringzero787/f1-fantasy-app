# Sign-off uc-v2.8.0

Decision: **approve** — No blocking gate failed, every applied waiver carries a reason and owner, and nothing presented shows an unsigned artifact or a reproducible-build hash mismatch.

# Release sign-off — undercut 2.8.0 (cc06fdc0)

**Project:** f1-fantasy-app / Undercut (com.undercut.app) · public-facing · stores: google_play, apple, amazon
**Version:** 2.8.0 (explicit) · tag `uc-v2.8.0` · since `uc-v2.7.1` (engine; the `uc-v2.7.2` tag is not on master's history — content since 2.7.2 is `6b209ca..cc06fdc`)
**Notes:** `.aidlc/releases/undercut-v2.8.0.md`, `CHANGELOG.md` · translated 9/9 languages

## What shipped
App changes in this build: F-131, F-136, F-142, F-143, F-145. (Corrected by hand: the generated list also named F-111 and F-129, which shipped in 2.5.0 and 2.7.0, and server-only features already live — F-134, F-137, F-138, F-139, F-141 — which no build carries.)

## Gates run and depth
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory only — `npm run lint` failed (low). Non-blocking. |
| G04 | pass | No findings. |
| G05 | pass | **Shallow**: no security-relevant hunks, scanners only. All findings waived (see below). |
| G07 | pass | Trademark watchlist; no new-name matches after waiver of test-fixture false positive. No registry lookup credentials. |
| G08 | pass | No regression. |
| G10 | pass | No findings. |
| G16 | pass | 9 languages in sync. |

G06 and G14 did not report a verdict for this commit; their waivers are on file from earlier in the cycle.

## Waivers applied
1. **G05 — `GHSA-` (blanket, by title)** — nathan, 2026-09-18, extended to **2026-12-15**. Pre-existing advisories in the functions lockfile untouched by this PR. *Acceptable only because it is time-boxed and owner-extended with a stated end date; it is weak in scope (prefix match, ~200 advisories, many high in runtime packages such as body-parser, @fastify/busboy, @grpc/grpc-js, ws, node-forge, sharp, image-size, zod). The dependency bump pass is now a hard commitment before 2026-12-15.*
2. **G14 — Destructive operation OP-033** — nathan, 2026-09-24, no expiry. Gen-1→Gen-2 recreation of two non-functional, data-free functions; OP-034 dry-run clean. *Acceptable; should carry an expiry or be closed once OP-034 is confirmed applied.*
3. **G06 — Hydration-gated language apply** — nathan, 2026-09-25. Splash is held by LaunchReveal; evidence cited in bootstrap.ts and F-079. *Acceptable (documented false positive).*
4. **G16 — Plural form missing ICU syntax** — nathan, 2026-09-25. i18next v4 suffix plurals; prompt fixed upstream (G16@2). *Acceptable.*
5. **G07 — "Grand Prix" in new name** — nathan, 2026-10-01. Test fixtures only; scanner lacks path scoping (aidlc#9). *Acceptable; the companion low (no USPTO/EUIPO credentials) correctly remains a live warn.*

All waivers have a reason, owner and date.

## Gaps in the evidence packet
- **SBOM:** `syft missing` — no SBOM diff since 2.7.1 was produced.
- **Artifacts / signatures / reproducible-build hash:** not present in the packet; could not be positively verified. Nothing shown is unsigned or mismatched, but this is absence of evidence, not confirmation. Publish the signed artifact list and repro hash with the release record.

## Residual risk
The largest open exposure is the blanket G05 waiver silencing ~200 advisories in the Cloud Functions dependency tree, including high-severity issues in runtime-facing packages on a public-facing backend; it has already been extended once and must be cleared by a bump pass before 2026-12-15. Secondary: no SBOM diff, no signature/repro-hash evidence in the packet, G14 waiver without expiry, and G07 cannot clear marks against a registry. No code-level security findings were raised for this diff.

---
**RELEASE: approve** — no blocking gate failed, every waiver has a stated reason, and nothing presented shows an unsigned artifact or reproducible-build mismatch; the G05 dependency debt is time-boxed and must be paid before 2026-12-15.


## Hand evidence
Signatures, hashes and in-binary checks for all three artifacts: `.aidlc/releases/undercut-v2.8.0.provenance.md`.
