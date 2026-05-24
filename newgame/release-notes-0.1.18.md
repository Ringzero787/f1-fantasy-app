# Track Limits 0.1.18

**versionCode:** 19
**versionName:** 0.1.18
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`
(also at `/mnt/smb/share/tracklimits-0.1.18.aab` and `C:\Users\natha\Downloads\`)

## Sprint weekends fixed

Two compounding bugs hid the Sprint scope on sprint weekends:

- **App jumped off the live weekend.** `getUpcomingRace` only matched
  `status == 'upcoming'`. The shared lock cron flips a race to `in_progress`
  when qualifying nears, so once the weekend started the app skipped to the
  *next* race (which usually isn't a sprint). Now it selects the earliest
  non-completed race (`status in upcoming|in_progress`), so you stay on the
  weekend that's actually happening.
- **Stale `hasSprint` flag.** Some race docs have `hasSprint: false` even
  though OpenF1 lists a Sprint session. Sprint detection now keys off
  `hasSprint` **or** `schedule.sprint`. (Undercut's `syncRaceSchedules` now
  also keeps the boolean in sync going forward — separate deploy.)

Verified on the Canadian GP sprint weekend: Sprint / Qualifying / Race tabs all
present, with the past Sprint session correctly locked.

## Lineup — phases (lock + results)

Each session now has a lifecycle:

- **Open** — WITH/AGAINST toggle, tap a row to stake.
- **Locked** (session started) — cards dim, taps disabled, the toggle becomes a
  padlock badge showing your frozen side + stake. Amber "locked" banner under
  the scope toggle.
- **Results** (after settlement) — each card shows a green `+$X` win or coral
  `MISS`, with a green "settled" banner. Reads the settled outcomes already
  written onto the picks doc — no extra fetch.

## Scoreboard

A **SCORE** chip in the lineup header opens a weekend summary overlay: net /
exposure hero, per-session Qualifying / Race (and Sprint) strips with W·L·pts,
and a line item for every staked pick. The chip shows live exposure (`$XM live`)
while open and settled net (`+$XM` / `−$XM`) once graded.

## Remote app config (infrastructure)

Added a launch-time gate that reads `tl_config/app` from Firestore so future
issues can be handled server-side without a build:

- `minSupportedVersionCode` → blocking "update required" screen for stale builds
- `notice {title, body, severity}` → dismissible banner (maintenance / MOTD)
- `features {}` → feature flags

Fails open — a missing/unreadable doc leaves the app fully functional. Inert
until the `tl_config` rule is deployed and the doc is created.

## Files touched

- `app/(tabs)/index.tsx` — phase wiring, scoreboard chip + overlay, sprint detection
- `src/components/tl/atoms.tsx` — `LockedBadge`, `ResultBadge`, `PhaseBanner`
- `src/components/tl/Scoreboard.tsx` — new
- `src/services/data.service.ts` — `getUpcomingRace` includes in-progress
- `src/types/index.ts` — `PickOutcome`, `settledOutcomes`, `AppConfig`
- `src/services/config.service.ts`, `src/hooks/useAppConfig.ts`,
  `src/components/AppConfigGate.tsx` — new (remote config)
- `app/_layout.tsx` — config gate wraps the app
- `app.config.js`, `android/app/build.gradle` — 0.1.17 → 0.1.18, vc 18 → 19

## Play Console "What's new" (≤500 chars)

```
v0.1.18 — Sprint weekends + live scoring

• Sprint weekends fixed: the Sprint tab is back, and the app stays on the race
  weekend that's actually happening instead of skipping ahead
• Lineups now lock when each session starts, then show your win/miss once
  results are in
• New Scoreboard: tap SCORE in the header for your weekend money + points,
  session by session
• Stability + behind-the-scenes improvements
```
