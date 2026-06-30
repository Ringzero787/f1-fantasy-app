# Changelog

All notable changes to **Undercut** (the root app; Track Limits lives in `newgame/`).

Versions are Android `versionName (versionCode)`. Many fixes are **Cloud Functions**
(server-side) and reach all users on deploy regardless of app version — those are
tagged **(server)**.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [2.1.9] (50) — 2026-06-30
### Changed
- No client changes vs 2.1.8 — fresh `versionCode` for a clean Play upload.
### Fixed (server)
- **Not-classified cars** (ran but outside the official classification, e.g. Albon at
  Barcelona) now score 0 via a distinct `nc` status instead of a phantom `P0 finished`.
- **Phantom positions-gained**: a `position 0` "finished" row had been awarding points
  equal to its grid slot (Albon: grid 18 → +18 race **and** +18 price points). Gated all
  of race scoring, the breakdown, and pricing on `position ≥ 1`.
- **Settle delay**: results auto-approve only 3h after the race ends, so stewards'
  post-race penalties are in the final classification (the Barcelona Colapinto +10s
  penalty had been missed).
- **Barcelona/Spain re-scored** to the official result (Colapinto P8→P10, Lawson P9→P8,
  Lindblad P10→P9, Albon NC); 19 teams adjusted, full audit passes.

## [2.1.8] (49) — 2026-06-21
### Added
- **Weekend recap** card on sign-in: total points, league rank, top/lowest scorer and a
  per-roster breakdown, shown once per completed race.

## [2.1.7] (48) — 2026-06-13
### Added
- **Remote-config version gate** (`config/app`): launch-time `minVersion` (force) /
  `latestVersion` (suggest) update prompts. Fails open. Doubles as a kill-switch for old
  clients incompatible with server changes.

## [2.1.6] (47) — 2026-06-13
### Fixed
- Removed deprecated edge-to-edge window APIs (`statusBarColor`/`navigationBarColor`,
  RN `StatusBar` `backgroundColor`) that triggered Google Play's API-35 warning.

## [2.1.5] (46) — 2026-06-13
### Added
- "Team reminders" opt-out toggle in profile settings (client side of the alerts feature).

## [2.1.4] (45) — 2026-06-12
A full scoring/economy overhaul after an audit found multiple calculation defects.
### Added (server)
- **Incomplete-team alerts** (`notifyIncompleteTeams`): push (email fallback) ~24h and ~2h
  before qualifying for teams missing drivers/a constructor; opt-out honoured.
### Changed
- **Server-authoritative roster operations** — buys/sells/swaps/builds go through
  transactional callables at server prices; budget is a cash ledger; Firestore rules deny
  client writes to roster/budget/points.
- Client: true sale quotes (single 3% fee impl), banked-points displays consistent across
  team/profile/standings, lock timing re-evaluated over time, schedule Timestamps parsed.
### Fixed (server)
- Single qualifying scoring path (removed the trigger double-fire).
- Idempotent market phases (`pricesApplied` stamp + deterministic price-history ids).
- Formula corrections: full-season lock bonus reachable, DNS distinct from DNF, MAX_PRICE
  clamp, grid from `/starting_grid`, league ranking tiebreaks, `lastRacePoints` two-team
  double-count.
- Hardening discovered while monitoring: skip empty shell teams (a crash that left Monaco
  unscored); coerce non-finite `racesHeld` so `increment(NaN)` can't abort a scoring batch.
- Roster callable crash: constructor writes use `set(merge)` not `update()` (the literal
  field `constructor` collided with `Object.prototype.constructor`).

---
_Earlier history predates this changelog; see git log._
