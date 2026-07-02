# Track Limits 0.1.23

**versionCode:** 24
**versionName:** 0.1.23
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`
(also at `/mnt/smb/share/track-limits-0.1.23-vc24.aab`)

**Supersedes 0.1.22** (which was built but never uploaded to Play). This build
bundles everything since 0.1.21, so the Play "What's new" below is cumulative
from the last live release.

## New in this build: Ben's O/U call on the pick pill

The pick lines now come from Ben's full O/U model, which stores each line as a
one-sided range (e.g. `[3–22]`). Those read as lopsided `P3–P22` pills. Added a
`benCall` field to `BenLine` (`"O 2.5"` / `"U 4.5"` / `"O 3.5 avg"`) and the
`BenLinePill` now shows it in place of the raw range when present. The range
still backs the tooltip and settlement; legacy lines with no `benCall` fall back
to the `P#–P#` label.

- `src/types/index.ts` — `benCall?: string` on `BenLine`
- `src/components/tl/atoms.tsx` — `BenLinePill` renders `benCall`; tooltip leads with the call
- `app/(tabs)/index.tsx`, `app/results.tsx` — pass `benCall` through
- `app.config.js` — 0.1.22 → 0.1.23 / vc 23 → 24

## Bundled from 0.1.22 (merged to master, never shipped to Play)

- **No-selection default** — picks are opt-in; unpicked entities score nothing. 3-state With/Against/clear toggle.
- **Weekly recap P&L** — net cash headline + winnings/losses split + W/L record.
- **Missing-picks reminders** — push (FCM) + Resend email before a race locks; bot accounts excluded.
- **Release-signing plugin fix** — signing now survives a clean prebuild.

## Play Console "What's new" (≤500 chars)

```
v0.1.23 — Your picks, your call

• Picks are now opt-in — no pick means no points. Tap With or Against Ben, tap again to clear.
• New weekend recap: winnings vs losses, net cash, and your win/loss record at a glance.
• Ben's calls now show as clear over/under lines (e.g. "O 2.5") on every pick.
• Reminders so you never miss your picks before a race locks.

Plus stability fixes under the hood.
```
