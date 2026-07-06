# Changelog

All notable changes to **Undercut** (the root app; Track Limits lives in `newgame/`).

Versions are Android `versionName (versionCode)`. Many fixes are **Cloud Functions**
(server-side) and reach all users on deploy regardless of app version — those are
tagged **(server)**.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [2.2.0] (51) — 2026-07-06
### Added
- **Constructor budget guard**: while the constructor slot is empty, the
  add-driver sheet warns when a buy would drop the budget below the cheapest
  constructor, and the Market header shows a persistent strip once it already has.

### Changed
- **Race Day redesign** of the whole (simple) UI, from the design handoff:
  - New theme: carbon-dark default + "paddock white" light, primary swapped
    from F1 red to the Undercut logo teal; reds now only mean negative/remove.
  - New type system: Inter body + Space Grotesk display with synthesized
    oblique "speed" numerals; skewed toggle tabs; teal `///` section labels.
  - My Team: full 5+1 roster + stat bar + header fit one phone viewport;
    driver tiles show racing numbers on team-color gradients; per-row figures
    (last-race delta · season total · price) right-aligned on one baseline;
    price rises shown as a green price + ▴ (exact delta on long-press);
    constructors use short names on roster cards; inline team rename.
  - Market: budget strip, segmented Drivers/Constructors toggle, search, sort
    chips, team-color row stripes, bottom-sheet add flow with 1–6 contract picker.
  - Standings/league, profile sheet, weekend recap, member team view and
    create-team all restyled to match.

### Fixed
- Crash ("Rendered more hooks…") on the first render after creating a team.
- Custom fonts silently failed to load in release builds (expo-font runtime
  asset resolution); the faces now ship natively in the Android project.
- Android ignores skew transforms on text — the display oblique uses real
  synthesized italics there instead.

### Fixed (server)
- Sprint weekends now lock at sprint qualifying, and teams no longer unlock
  mid-weekend between sessions.
- 2026 sprint calendar corrected (rounds 7/11/14/18).
- Results ingestion re-checks recently-completed races for stewards' corrections.

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
