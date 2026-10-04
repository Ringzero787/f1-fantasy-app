# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: Unified accounts, purchase security, and Pit Wall premium features.

## Added

- Cross-store sign-in: your account works whether you installed from Google Play, the App Store, or Amazon Appstore
- Share league standings and your team directly from the app
- Pit Wall Pass entitlements now revoke when the store refunds your purchase
- Driver detail in the app showing what your pass purchased
- Pit Wall Briefing redesign with hero section, calls strip, and price movers

## Changed

- The Ace lock now reads the server calendar instead of the bundled one
- Pit Wall projections include floor, median, ceiling, DNF risk, and next price estimates
- The Pit Wall Pass ($14.99/season) is the sole premium product; League Pro derives from pass ownership

## Fixed

- **Security**: Crafted Play Store tokens could no longer purchase packs or passes at incorrect prices
- **Security**: Production API key fallback removed; no silent downgrade on configuration errors
- Ace window now freezes for every session it scores in, not just races
- Sign-in handoff locked to the device that started it
- Purchases now grant once per transaction, not once per app launch
- Pass grants work correctly after revokes
- Stranded purchases in the store's queue now finish properly
- Round mapping corrected; Bahrain reinstated at Sepang as R18
- Nine operational scripts no longer silently fail on import
- Team SHARE field reads as control, not caption
- Seeder import halted; calendar now correct
- iOS build no longer offers Amazon Appstore option

## Security

- Ace lock moved to server; removed app-only implementation
- Amazon and Apple shared secrets migrated to Secret Manager
- Amazon receipt IDs use their own shape, not Play Store's
- High-severity dependency advisories cleared
- All import-time guards and escape classes now closed

