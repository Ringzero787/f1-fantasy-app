# Track Limits 0.1.17

**versionCode:** 18
**versionName:** 0.1.17

> Re-cut of 0.1.16 (icon tab bar + Garage/Shop sizing + picks refactor) with a
> fresh versionCode so it can be uploaded over the version Google already has.
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`

## Picks service — Firestore as the source of truth

Rewrote how picks are read and written. The old path used a transaction +
`getOrCreate` and kept a parallel optimistic copy in the Zustand store, which
left two writers fighting over the same state. The new path relies on the
Firestore SDK's built-in latency compensation:

- `picksService.subscribe(userId, raceId, cb)` attaches an `onSnapshot`
  listener. The snapshot callback is the **only** writer to the store's
  `byRaceId` map.
- `setSide` / `setStake` issue a `setDoc(…, { merge: true })`. The SDK emits
  the pending state to the same listener instantly (well before the server
  acks), so the UI updates without any manual optimistic shim.
- Doc creation is implicit — `merge: true` writes the doc if missing.
  `getOrCreate` and the transaction are gone.

Net effect: no race between optimistic state and the server response, no
stale reads after a flip-then-stake sequence, and ~60 fewer lines of pick
plumbing.

## Garage + Shop — sizing pass

Driver portraits and card typography were undersized for the target devices.
Across Garage (rostered, bench) and Shop (driver, constructor):

- Portrait 52 → 62 (Shop), 56 → 68 (Garage)
- Display name 15 → 18 / 16 → 19
- Constructor row + meta text 11 → 13
- Card padding 14 → 17, gap 12 → 14
- Buy button height 44 → 52, price font 13 → 16
- Constructor color rail 4 → 5 px

Nothing structural — purely visual scale. Existing layout still fits on small
phones.

## Files touched

- `app.config.js`, `android/app/build.gradle` — version 0.1.15 → 0.1.16,
  versionCode 16 → 17
- `src/services/picks.service.ts` — full rewrite (subscribe + merge writes)
- `src/store/picks.store.ts` — `load` removed, `subscribe` added
- `app/(tabs)/index.tsx` — Lineup screen wired to `subscribe()` via
  `useEffect` cleanup
- `app/demo.tsx` — uses `get()` with a null-coalesced default, since
  `getOrCreate` no longer exists
- `app/(tabs)/garage.tsx`, `app/(tabs)/shop.tsx` — sizing pass
- `app/(tabs)/profile.tsx` — version label

## Play Console "What's new" (≤500 chars)

```
v0.1.16 — Picks plumbing + bigger cards

• Picks now flow through Firestore's live snapshot listener — flip and stake
  changes apply instantly with no double-bookkeeping
• Garage and Shop cards sized up: bigger portraits, larger names, more
  generous padding, easier-to-tap Buy buttons
• Internal: removed the transaction-based pick writer and the parallel
  optimistic store, cutting a class of flip-then-stake race conditions
```
