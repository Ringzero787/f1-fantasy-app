# Track Limits 0.1.19

**versionCode:** 20
**versionName:** 0.1.19
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`
(also at `/mnt/smb/share/tracklimits-0.1.19.aab` and `C:\Users\natha\Downloads\`)

## Session Summary recap (v3 handoff)

A paged recap overlay that **auto-pops the first time a session settles**:

- **One page per newly-settled scope** (Sprint / Qualifying / Race): a headline
  ("Cashed in." / "Tough scope."), big signed net hero + points, Hits/Misses
  tiles with gross won/lost, "Big winner" / "Hurt the most" callouts, and the
  full pick list (side chip, Ben's range → realised position, signed delta).
- **Weekend wrap** page when 2+ scopes settled: combined net ("You beat Ben." /
  "Ben beat you."), points, W/L, and per-scope mini bars.
- Progress dots + Back / Next / "Got it".
- **"Seen" persists** in AsyncStorage (keyed by raceId+scope) so it never
  re-pops. Reopen anytime via the new **"View full recap"** button in the
  Scoreboard overlay.

Runs entirely off the picks doc the lineup already subscribes to — no new fetch.
`summarizeScope` was extended with gross won/lost totals and per-line Ben range
+ realised position. Trigger is `settledOutcomes` (written by `tlSettleWeekend`),
so the recap appears once a weekend is graded.

## Files touched

- `src/components/tl/SessionSummary.tsx` — new (`useSessionSummary` hook + overlay)
- `src/components/tl/Scoreboard.tsx` — `summarizeScope` won/lost + line range/result; "View full recap" button
- `src/components/tl/index.ts` — exports
- `app/(tabs)/index.tsx` — settled-scope detection, hook, overlay mount, recap wiring
- `app.config.js`, `android/app/build.gradle` — 0.1.18 → 0.1.19, vc 19 → 20

## Play Console "What's new" (≤500 chars)

```
v0.1.19 — Weekend recap

• New Session Summary: once a session is graded, a recap pops with your net,
  points, hits/misses, biggest winner & worst pick, and every call
• A Weekend Wrap ties it together when more than one session settles
• Reopen anytime from "View full recap" in the Scoreboard
```
