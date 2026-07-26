# Track Limits 0.1.39 (versionCode 40)

## Fixed

- **Weekend recap can no longer be lost unseen.** The Android back button used
  to permanently mark the recap as seen even when it was buried under another
  modal (the call-sign trap ate the R13 recap this way). Back is now a soft
  dismissal — the recap returns next launch until you actually close it with
  GOT IT or ×. Seen-tracking storage key bumped (v2), so a recap that was
  eaten previously resurfaces once.

## New

- **League members are tappable.** Tap any row on a league leaderboard to see
  that player's high-level results: season points, net cash, record vs Ben,
  and a per-weekend breakdown (round, race, W-L, points, cash).

## Play Console blurb

> New: tap any league member to see their season results and week-by-week
> record vs Ben. Fixed: the weekend recap now keeps coming back until you
> actually close it.
