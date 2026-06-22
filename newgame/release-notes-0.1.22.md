# Track Limits 0.1.22

**versionCode:** 23
**versionName:** 0.1.22
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`
(also at `/mnt/smb/share/track-limits-0.1.22-vc23.aab`)

## No selection is the default pick

Picks are now opt-in. Previously every entity defaulted to a WITH bet on screen
even though only picks you actually made were scored — misleading. Now:

- The pick toggle is **three-state** (no pick / With / Against). Tapping the
  active side clears it back to no pick.
- Untouched entities show a neutral "No pick" and **score nothing** — if you
  don't make a call, you don't win or lose on it.
- Status line reads "No picks — make a call or you score nothing."
- Server: `tlSetPick` gained a `clear` path (removes the pick, refunds any
  escrowed stake, session-locked). The recap only lists entities you picked.

## Weekend recap — winnings vs losses

The recap hero now leads with a **Weekend P&L card**: net cash headline, an
explicit +$ won / −$ lost split, and Points / W–L record / Calls tiles.

## "You haven't picked" reminders (push + email)

A scheduled reminder nudges players who haven't made any picks before a race
locks (no pick = no points). Push via FCM if a device token exists, else a
Resend email. Two nudges (~24h and ~2.5h out), deduped, with an opt-out.

- Client registers a device push token after sign-in (`expo-notifications`).
- Server: `tlNotifyMissingPicks` scheduler + `sendPush` (FCM) + `tl_notifications`
  history. **Scheduler not yet enabled in prod** (gated until ramp).

## Fix — release signing plugin

`withReleaseSigning` guarded on `signingConfigs {…release {`, which falsely
matched the `buildTypes.release` block, so `expo prebuild --clean` produced a
build.gradle with no release signingConfig. Now guards on the keystore filename
so signing survives a clean prebuild.

## Files touched

- `app/(tabs)/index.tsx` — 3-state toggle wiring, unpicked tally, status line
- `src/components/tl/atoms.tsx` — `WithAgainstToggle` 3-state, `LockedBadge` "No pick"
- `src/services/picks.service.ts`, `src/store/picks.store.ts` — `clearPick`, null default
- `src/components/sheets/StakeSheet.tsx`, `app/onboarding.tsx` — onSelect migration
- `app/results.tsx` — Weekend P&L card; recap limited to picked entities
- `functions/src/economy/pickCallables.ts` — `tlSetPick` clear path
- `functions/src/notifications/{sendPush,notifyMissingPicks}.ts` — new
- `functions/src/index.ts` — export `tlNotifyMissingPicks`
- `src/services/notifications.service.ts`, `app/_layout.tsx` — push registration
- `app.config.js` — expo-notifications plugin, 0.1.21→0.1.22 / vc 22→23
- `plugins/withReleaseSigning.js` — guard fix
- `firestore.rules` — `tl_notifications` (server-write, owner-read)

## Play Console "What's new" (≤500 chars)

```
v0.1.22 — Your picks, your call

• Picks are now opt-in. No pick means no points — only the calls you actually make are scored. Tap to pick With or Against Ben, tap again to clear.
• New weekend recap: see your winnings vs losses, net cash, and your win/loss record at a glance.
• Reminders so you never miss your picks before a race locks.

Plus signing and stability fixes under the hood.
```
