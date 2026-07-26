# Track Limits 0.1.38 (versionCode 39)

## Changed

- **Wrong calls now cost $10** — the balancing sink for the $10 win bonus.
  Every graded pick is now ±$10 (plus stake × odds on staked wins, minus the
  stake on staked losses). Leaderboard P&L counts full losses; the garage
  debit is floored so spendable cash never goes below $0. Server-side in
  settlement (live since 2026-07-26); this build only updates the Ben-pill
  tooltip to disclose the risk.

## Server notes (no app update needed)

- `tlSettleWeekend` / `tlOnRaceCompleted` deployed with `LOSS_PENALTY = 10`.
- Settlement now stores `garageApplied` per pick doc (exact floor-aware cash
  applied), so corrections claw back precisely; legacy docs reconstruct.
- Hungary R13 was settled before the sink existed and is not re-graded
  (unchanged results signature). Penalties start with the next settled round.

## Play Console blurb

> Balance update: correct calls pay $10, wrong calls now cost $10 (your cash
> never drops below $0). Choose your battles.
