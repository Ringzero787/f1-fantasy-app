# Track Limits 0.1.44 (versionCode 45)

Backing a call with cash is now worth more. Unlike 0.1.43, this one players
will actually feel — though the payout change is server side and went live on
2026-09-17, so it already applies to everyone from the Azerbaijan GP onward,
whatever app version they are on. This build brings the in-app wording into
line with it.

## Changed

- **Back your calls and get paid more.** A correct call still pays the flat
  $10 it always did. Now, if you staked cash on it, a correct call earns an
  extra 50% of your stake on top — up to $25 extra. Stake $10 and a win pays
  $15 in bonus; stake $25 and it pays $22.50; the extra maxes out at a $50
  stake. Free calls are deliberately unchanged, so the top-up only rewards
  calls you put money behind (F-043).
- The prediction pill's "Ben's guess" explainer now describes the top-up and
  its cap instead of the old "stake cash to amplify" line.

## Fixed

- **Odds can no longer be priced at or below 1.00.** The scripts that post
  Ben's weekly lines now share the same capped pricing as the in-app odds
  generator, so a correct call always returns more than the stake (F-041).

## Behind the scenes

- A calibration backtest now reports how well Ben's lines actually predicted
  results — landed vs stated chance, Brier score and skill, returns for
  backing WITH or AGAINST, and the book's settled P&L. It runs as an advisory
  lookback and its reports stay on the private share (F-042).

## Play Console blurb

> Win more when you back your calls: a correct call you staked cash on now
> pays an extra 50% of your stake, up to $25 on top of the usual $10 bonus.
> Free calls are unchanged. Also fixes a rare case where offered odds could be
> priced too low to be worth taking.
