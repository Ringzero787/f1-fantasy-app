# Sign-off tl-v0.1.44

Decision: **approve** — No blocking gate failed, no waivers were applied, and no artifact is shown to be unsigned or hash-mismatched; the only gate deviation is an advisory lint failure.

# Release sign-off: tracklimits v0.1.44

**Project:** f1-fantasy-app — Track Limits (`newgame/`, `com.tracklimits.app`)  
**Version:** 0.1.44 (explicit), since `tl-v0.1.43`  
**Tag:** `tl-v0.1.44`  
**Release notes:** `.aidlc/releases/tracklimits-v0.1.44.md`  
**Changelog:** `newgame/CHANGELOG.md`  
**Stores:** google_play, apple, amazon (public-facing)

## What shipped
- F-041
- F-042
- F-043

## Gate results
| Gate | Verdict | Depth / notes |
|------|---------|---------------|
| G03 | warn | Advisory check `npm run lint` failed — [low]. Non-blocking. |
| G04 | pass | No findings. |
| G05 | pass | No security-relevant hunks; scanners only (no manual security review). |
| G07 | pass | No findings. |
| G08 | pass | No regression. |
| G10 | pass | No findings. |

No blocking gate failed.

## Waivers
None applied. Nothing to assess for acceptability.

## Supply-chain evidence
- **SBOM:** not generated — `syft` missing. No SBOM diff since 0.1.43 is available for this record.
- **Artifact signatures:** artifact list with signatures was not present in the evidence packet; no artifact is shown as unsigned, but signing was not directly verified here.
- **Reproducible-build hash:** no hash comparison present in the evidence packet; no mismatch is shown, but reproducibility was not directly verified here.

### Operator verification appended after sign-off
The sign-off ran without `cosign`/`syft` on the build box, so the evidence packet carried no signature list. The artifact was instead verified by hand after the gate:

- **Artifact:** `tracklimits-0.1.44-vc45.aab`
- **Signer:** `CN=TrackLimits, OU=TrackLimits, O=TrackLimits, L=Unknown, ST=Unknown, C=US`, valid 2026-05-19 → 2053-10-04 (`keytool -printcert`)
- **SHA-256:** `b9c96e5ed9cf446c1c33d7d10c7e3d4979307b55b60167741ccae67face003d3`

This closes the signing question for this release; the SBOM and reproducible-build gaps remain open.

## Findings recorded at sign-off
1. **[medium]** SBOM missing (syft not installed) — dependency delta since 0.1.43 unenumerated. Fix: install syft in the release pipeline and regenerate/attach the SBOM diff to this release record.
2. **[medium]** Artifact signature list and reproducible-build hash comparison not attached — sign-off relies on absence of a failing gate rather than direct evidence. Fix: attach the signed artifact manifest and repro hash output to `.aidlc/releases/tracklimits-v0.1.44.md`.
3. **[low]** `npm run lint` failing (G03 advisory). Fix: clear lint errors before 0.1.45 or promote G03 to blocking once clean.

## Residual risk
The primary residual risk is evidentiary rather than a known defect: without an SBOM diff, newly introduced vulnerable or license-problematic dependencies cannot be ruled out; without the attached signature list and repro hash, supply-chain integrity is inferred from passing gates rather than confirmed. G05 ran scanners only with no manual review depth. Functional risk to store users is low given three scoped features and a clean regression gate; the lint failure is advisory but represents accumulating debt.

**RELEASE: approve** — no blocking gate failed, no waivers were needed, and no artifact is shown unsigned or hash-mismatched; the missing SBOM and unattached signature/hash evidence are recorded as gaps to close before the next release.
