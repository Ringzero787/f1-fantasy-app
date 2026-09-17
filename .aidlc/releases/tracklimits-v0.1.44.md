# tl-v0.1.44 — 2026-09-17

Track Limits now pays more for the calls you back with cash, keeps offered odds above 1.00, and adds a calibration backtest for Ben's lines.

## Added

- **Stake-scaled win bonus** (F-043): a correct call still pays the flat $10, and now earns an extra 50% of whatever you staked on top of it, capped at $25 extra. Free calls are unchanged — the top-up only rewards calls you put money behind. The bonus sits outside the best-bet multiplier, so an AGAINST best-bet win still boosts only the profit on the stake.
- **Ben's lines calibration backtest** (F-042): an advisory lookback reporting how well the lines predicted results — landed vs stated chance by bucket, Brier score and skill, returns for backing WITH or AGAINST, zone/kind/session splits, the best-bet record, and the book's settled P&L. Reports go to the private share, never this repo.

## Fixed

- **Offered odds floor** (F-041): odds priced from the model can no longer fall to or below 1.00. The line scripts now share the same capped pricing as the in-app odds generator, so a correct call always returns more than the stake.
