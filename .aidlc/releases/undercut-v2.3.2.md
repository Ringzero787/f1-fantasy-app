# uc-v2.3.2 — 2026-09-19

Undercut 2.3.2 moves league bookkeeping to the server. It is step A of F-059; the rule tightening (step B) follows once 2.3.2 is the minimum supported version.

## Added

- Team-name availability is checked by a Cloud Function instead of a broad query from the device

## Changed

- The app no longer writes a league's member count; the server recounts approved members when membership changes and once a day
- Extra league player slots are granted by the server from a validated store purchase (an interim client fallback remains until a live test purchase validates end to end)

## Fixed

- Google Play purchase validation uses the correct package name (com.undercut.app)

## Security

- League and member rule hardening (F-056), live on the server since 2026-09-18
- Not yet in force: scoped fantasy-team reads, owner-only member count and the `maxMembers` lock (F-059 step B)
