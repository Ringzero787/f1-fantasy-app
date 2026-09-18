# Sign-off uc-v2.3.1

Decision: **approve** — No hold condition is met: no blocking gate failed, the only waiver has a reason and expiry, and no artifact in the record is shown unsigned or hash-mismatched. Approval is recorded with the explicit caveat that SBOM and artifact-signature evidence were absent from the packet and must be attached before store submission.

# Release sign-off — Undercut (f1-fantasy-app) v2.3.1

**Tag:** `uc-v2.3.1` (explicit version, since `uc-v2.3.0`)  
**Change set:** `de08db5a`  
**Shipped:** F-058  
**Notes:** `.aidlc/releases/undercut-v2.3.1.md` · **Changelog:** `CHANGELOG.md`  
**Stores:** Google Play, Apple, Amazon (public-facing)

## What shipped
A single feature (F-058) in the Undercut app (`com.undercut.app`). The change set contains no security-relevant hunks per G05; the functions lockfile was not modified.

## Gates run and depth
| Gate | Verdict | Depth / notes |
|---|---|---|
| G03 | warn | Advisory check `npm run lint` failed (low). Non-blocking. |
| G04 | pass | — |
| G05 | pass | Scanners only — no security-relevant hunks, so no manual security review was performed. |
| G07 | pass | — |
| G08 | pass | No regression. |
| G10 | pass | — |

Gates G01, G02, G06 and G09 do not appear in the verdict set; treated as not applicable / not configured for this release. No blocking gate failed.

## Waivers
**G05 — `GHSA-` (by nathan, 2026-09-18, expires 2026-10-31).** Reason: pre-existing dependency advisories in the functions lockfile from the F-027 dependency bump; this PR does not touch that lockfile; CI reports absolute paths so the waiver is by title.

*Assessment:* acceptable under the rule (reason present, expiry set, scope limited to a lockfile this release does not change). Two caveats for the record: (1) the match key `GHSA-` is a bare prefix that will absorb *any* GitHub advisory in that lockfile until expiry, not just the F-027 set — it should be narrowed to specific IDs; (2) G05 passed on its own, so the waiver was not load-bearing for this release.

## Findings
- **High — SBOM diff missing.** Evidence records `sbom: syft missing`. The dependency delta since 2.3.0 is unverified.
- **High — Artifact list / signatures not in the packet.** The sign-off brief states an artifact list with signatures was attached; none is present, and no reproducible-build hash is recorded. Signing is therefore assumed, not confirmed. Attach before store submission.
- **Medium — Overly broad waiver key.** `GHSA-` prefix match; narrow to explicit advisory IDs.
- **Low — Lint advisory failed (G03).** Fix or explicitly accept in the next release.

## Residual risk
The release is low-change and gate results are clean, but the record is thinner than the process assumes: no SBOM diff, no artifact/signature evidence, and no reproducible-build hash were present, so dependency drift and artifact integrity are unverified rather than verified. The GHSA- waiver would silently cover new advisories in the functions lockfile until 2026-10-31. Lint remains failing at advisory level. None of these trip a hold condition under the stated rule.

---
**RELEASE: approve** — no blocking gate failed and the sole waiver is reasoned and time-boxed; approval is recorded with the requirement that the artifact signature list and SBOM be attached to this record before publication.

## Manual artifact verification (2026-09-18, build box; cosign and syft are not installed)

Shipped artifacts come from the publishing run on commit 4ba8738 (all three targets built, verified by their scripts, copied to `/mnt/smb/share/undercut/` and the workstation; the size gate then failed on a false +100% iOS reading caused by the previous version's IPA left in the artifact folder, fixed in #63). The run recorded here (de08db5) rebuilt with `UC_SKIP_PUBLISH=1` to complete the gate record; de08db5 differs from 4ba8738 only in `scripts/release/build-uc-ios.sh`. Real iOS size: 28,453,936 B vs 28,440,993 B for 2.3.0 (+0.05%).

| Artifact | SHA-256 | Signature |
|---|---|---|
| `undercut-2.3.1-vc56.aab` (Play) | `7213993ae4dba1cb487f611750933dbf804fb7b9a908359169fcadba41d2ac70` | `keytool -printcert -jarfile`: CN=Nathan Shanks, OU=Mobile, O=Undercut; cert SHA-256 `70:EC:4C:19:…:16:CF:E7` |
| `undercut-2.3.1-vc56-amazon.apk` (Amazon) | `f8299cc0f75ad22b384ec832870d1a3b81a0c5b1d0066214ed1dbf5098dc269e` | `apksigner verify --print-certs`: same Undercut certificate (`70ec4c19…5016cfe7`) |
| `undercut-2.3.1-build39.ipa` (App Store) | `faf07578d2c90d6cdd250f330dbdb88c0b66c25564cfa0437f03e4ad950d99b2` | Apple Distribution: Nathan Shanks (MWVD9BU5VW), verified by the archive script (version, build, bundle id, profile); altool: "No errors uploading archive" (build 39) |

2.3.0 (tag `uc-v2.3.0`, vc55 / build 38) was built and its iOS build uploaded, but it was never submitted to any store; 2.3.1 supersedes it. A verification build of this code (demo entry enabled, not a store artifact) was exercised on the Pixel 10 Pro XL emulator by the owner.
