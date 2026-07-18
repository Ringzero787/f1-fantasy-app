# Track Limits 0.1.32

**versionCode:** 33
**versionName:** 0.1.32
**AAB:** staged at gamer `Downloads\TrackLimits-0.1.32-vc33.aab`

## Pull-to-refresh everywhere

RefreshControl added to the four tabs that lacked it: Lineup (refetches
races + garage + Ben lines; picks are already live via onSnapshot), League
detail (reuses reload(), with the first-load spinner gate softened so the
list stays mounted mid-pull), Shop (garage + catalog), Profile (season
totals + entitlements). Leagues list and Garage already had it.

## Companion backend change (separate deploy)

Undercut ingestion tightened for ASAP scoring: all three session checkers
every 10 min (were 15/30/30) and race auto-approval buffer 1h → 15m — safe
because the 6h correction re-check delta-re-grades late penalties. TL
settlement triggers off the race doc, so it inherits the speedup.

## Play "What's new"

Pull down to refresh on any screen. Faster scoring after each session.
