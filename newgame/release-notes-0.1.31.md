# Track Limits 0.1.31

**versionCode:** 32
**versionName:** 0.1.31
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`
(staged at gamer `Downloads\TrackLimits-0.1.31-vc32.aab`)

## Drop the "M" from money labels

Cash amounts were rendered with an "M" (millions) suffix in the Scoreboard
(weekend exposure sheet) and SessionSummary (session/weekend recap) —
"$5M at risk", "+$12M won", plus three standalone styled `M` elements next
to hero values. Betting is denominated in plain dollars everywhere else
(shop, stakes, bankroll), so the M was a leftover fiction. All removed;
values now read "$5 at risk", "+$12", etc. No math changes — display only.

## Play "What's new"

Cleaner money labels throughout scoring and recaps.
