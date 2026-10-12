# Sign-off uc-v2.5.3

Decision: **hold** — Artifact list/signatures, reproducible-build hash and SBOM diff are absent from the evidence package (sbom: syft missing), so two of the four mandatory hold conditions cannot be checked; sign-off cannot be recorded against artifacts that were never presented.

# Release sign-off — Undercut 2.5.3 (uc-v2.5.3)

**Project:** f1-fantasy-app / Undercut (com.undercut.app), Expo + Firebase Cloud Functions
**Since:** uc-v2.5.2 · **Shipped:** F-108, F-120 · **Notes:** .aidlc/releases/undercut-v2.5.3.md, CHANGELOG.md · **Translations:** 9/9

## Gates run
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory `npm run lint` failed (low). Non-blocking. |
| G04 | pass | No findings. |
| G05 | pass | Scanners only (no security-relevant hunks). All advisories waived under the 2026-09-18 pattern waiver. |
| G07 | pass | No findings this run; earlier Grand Prix fixture match waived 2026-10-01. |
| G08 | pass | No regression. |
| G10 | pass | No findings. |
| G16 | pass | 9 languages in sync; ICU plural finding waived as false positive. |
| G14 | **no verdict in record** | A destructive-operation waiver (OP-033) references this gate, but no verdict is attached. |
| G06 | no verdict in record | A hydration-gating waiver references this gate; absence may be because it was not applicable this release. |

## Waivers
- **G05 / GHSA-\*** — pre-existing advisories in the functions lockfile, not touched by this release; expires 2026-10-31. Reason present. *Acceptable with reservation:* the pattern is broad enough to absorb new advisories, and the findings span several lockfiles (sharp, ws, grpc-js, brace-expansion high-severity), not only the one named.
- **G14 / OP-033** — gen-1→gen-2 migration of pw-createPortalHandoff / pw-redeemPortalHandoff; no data, already non-functional in prod; OP-034 dry-run clean; owner approved 2026-09-24. Reason present and sound, but the G14 verdict it attaches to is missing from this record.
- **G06 / hydration-gated language apply** — false positive, LaunchReveal keeps splash up; evidence cited in bootstrap.ts and F-079 spec. Acceptable.
- **G16 / plural ICU syntax** — false positive, i18next v4 suffix plurals; gate prompt corrected upstream (G16@2). Acceptable.
- **G07 / "Grand Prix" in new name** — test fixtures only, scanner lacks path scoping (aidlc#9); descriptive use is permitted by repo trademark policy. Acceptable; the low credential-gap finding stays live as warn.

## Artifacts, signatures, reproducibility, SBOM
The sign-off brief states the artifact list with signatures and the SBOM diff are attached. They are not present in the evidence: `sbom: syft missing`, no artifact list, no signature status, no reproducible-build hash. I cannot verify the *unsigned artifact* or *hash mismatch* hold conditions.

## Residual risk
If artifacts are signed and reproducible, residual risk is dominated by the blanket G05 dependency waiver (~60 advisories, several high, across multiple lockfiles, auto-absorbing anything new until 2026-10-31), the unverified G14 outcome for the function delete/recreate, and the accepted lint and trademark-credential gaps.

**RELEASE: hold** — artifact signatures, build hash and SBOM diff were not supplied, so the mandatory signing/reproducibility checks cannot be confirmed; flips to approve once the artifact list with signatures (and a G14 verdict) is attached.

## Residual risk
Assuming the artifacts turn out to be signed and the hash matches, the residual risk is concentrated in the G05 dependency posture: roughly sixty advisories across multiple lockfiles (including high-severity items in sharp, ws, @grpc/grpc-js, brace-expansion, image-size, node-forge, source-map-js) are waived under a single pattern waiver keyed on 'GHSA-', which will also silently absorb any genuinely new advisory until it expires on 2026-10-31. The G14 destructive migration (deleting and recreating two gen-1 portal-handoff functions at gen-2) is well reasoned and the functions are already non-functional in production, but G14 itself has no verdict in the record, so OP-034's post-recreate state is unverified here. The lint advisory failure (G03) and the trademark gate's lack of USPTO/EUIPO credentials (G07 low) are accepted, non-blocking gaps.
