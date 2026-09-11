# tl-v0.1.43 — 2026-09-11

Track Limits now requires admin authentication for seed operations and adds production deployment automation.

## Added

- **Ben lines invariant checker**: Automated validation of betting lines ensures range bounds, odds above 1.00, book margin calculations, exactly 3 race best bets per roster, coverage, freshness, and edit lockout after race start.
- **Settlement and odds unit tests**: New test suite for payout calculations, outcome decisions, odds pricing, and configuration parsing to ensure bet integrity.
- **Production operations via AIDLC**: Firestore data writes, seeding, best bets, repairs, and Firebase rules/indexes/functions deployment for both apps now run as automated operations with dry-run, backup, verification, and rollback gates.

## Changed

- **Release signing**: AIDLC release tier now builds AAB locally with Gradle instead of EAS, verifying the bundle contains Track Limits JS and is signed by CN=TrackLimits.

## Fixed

- **Seed endpoint authentication**: Seed endpoints (tlSeedRaces, tlBackfillBenLines, tlGenerateBenLinesLite) now require Firebase admin ID tokens instead of shared secrets, removing credentials from app demo screen and admin interface.
- **Keystore security**: Removed keystore passwords from public repository.
