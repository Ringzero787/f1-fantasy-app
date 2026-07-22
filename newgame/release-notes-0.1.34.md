# Track Limits 0.1.34

**versionCode:** 35
**AAB:** staged at gamer `Downloads\TrackLimits-0.1.34-vc35.aab`

## Call signs

- New post-signin prompt when the account name is a signup placeholder
  ("Player" / "Track Limits Player" / "Demo XXXX"): pick a call sign or take
  the default — first 6 characters of the email (per product decision).
- Profile "Edit name" fixed: the save tap was being swallowed by the
  keyboard-dismiss gesture (ScrollView needed keyboardShouldPersistTaps).
- Missing-name normalization fallback now also uses the email's first 6 chars.

## Store hardening (server, deployed separately — already live)

tlMockPurchase now only accepts cosmetic + capped garage products. Cash
bundles were an unlimited free-money exploit (applyEntitlement has no weekly
cap); blocked until real IAP ships. Verified: cash bundle rejected,
cosmetics still purchasable.

## Play "What's new"

Pick your own call sign — and name editing now works properly.
