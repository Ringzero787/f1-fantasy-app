# Track Limits 0.1.41 (versionCode 42)

Also includes everything from the unshipped 0.1.40 (vc41).

## New

- **Cosmetic packs now cost garage cash.** Helmets and pack flair are bought
  with the same bankroll you win on race weekends — heritage packs $75, era
  packs $150, premium $350. The store shows your bankroll, what a purchase
  leaves behind, and blocks the buy (with the shortfall) when you can't
  afford it yet. Purchases are server-authoritative and atomic: debit, pack
  grant, and a garage ledger entry land together. Free mock grants are gone —
  on older builds the pack "GET" button now returns an update-the-app error.

## Fixed (from 0.1.40)

- **Call-sign prompt can never overwrite a chosen name again.** If the prompt
  is ever opened while the account already has a real name (stale local state
  on some devices), it now re-checks the server profile and silently closes
  itself instead of offering a one-tap suggestion that would clobber the
  existing name.

## Play Console blurb

> New: spend your race-weekend winnings in the store — helmet packs now cost
> garage cash, with your bankroll and prices shown up front. Fixed: a rare
> prompt that could reset your call sign after an app update.
