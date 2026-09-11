# Track Limits 0.1.43 (versionCode 44)

A maintenance and security build. Nothing players see changes; the first
release cut through AIDLC (`aidlc run --tier release --unit tracklimits`).

## Fixed

- **Line generation is admin-only.** The Demo & debug screen's
  "Generate Ben-Lite" button sends the signed-in account's token; the server
  endpoints behind it (race calendar seeding, line backfill and generation)
  no longer accept a shared key and refuse anyone without the admin claim
  (server side live since 2026-09-11, F-037).

## Behind the scenes

- The release signing password is no longer stored in the app's source; the
  build reads it from the build machine (F-033).
- The release AAB is checked before it leaves the build box: signed with the
  Track Limits key, and its JavaScript is Track Limits' own (F-014).
- Settlement and odds math now have automated tests that run on every change
  (F-040).

## Play Console blurb

> Maintenance update: security hardening and behind-the-scenes improvements.
