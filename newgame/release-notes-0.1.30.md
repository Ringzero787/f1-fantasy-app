# Track Limits 0.1.30

**versionCode:** 31
**versionName:** 0.1.30
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`

Three fixes from user reports (2026-07-16).

## League create crash — "Unsupported field value: undefined"

Accounts whose `tl_users` doc predates the `displayName` field crashed league
create/join (`setDoc` rejects undefined) and the Profile tab
(`displayName.charAt(0)`) — the latter is almost certainly the account-specific
Profile crash the 0.1.24 diagnostic boundary was hunting. Fixed at the source:
`getUserProfile` now normalizes `displayName` (falls back to the email prefix,
then "Player"), plus `?? 'Player'` guards at all three league member-doc
writes.

## Shop: full catalog

The 5-slot random offer + $5 paid reroll is gone. The shop now lists **every**
driver and constructor you don't own, priciest first, all buyable at list
price (user-confirmed design). Same change applies to the Spend/Replace
sheets. `shopService.rollOffer` → `getCatalog`; reroll UI removed.

## Offline: tabs render last-known data

New `src/utils/offlineCache.ts` — `withOfflineFallback(key, fetcher)` caches
each successful read in AsyncStorage and serves the cached copy when the
fetch fails. Wrapped: my-leagues list, league detail + members, active
drivers/constructors (shop catalog + garage hydration), upcoming race
(cache now beats the mock-race fallback), Ben lines, garage, one-shot picks.
Writes still require a connection and error normally.

Caveat: cached Firestore Timestamps revive as plain `{seconds}` objects — the
shared `toDate`/`toMillis` helpers were extended to handle that shape; any
future date access on cached paths must go through them.

## Play "What's new"

- League creation no longer fails for some accounts
- Shop now lists every driver and constructor with prices
- Tabs now show your last-loaded data when you're offline
