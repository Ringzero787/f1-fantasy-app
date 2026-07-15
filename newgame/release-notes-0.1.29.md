# Track Limits 0.1.29

**versionCode:** 30
**versionName:** 0.1.29
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`

## Crash reporter

Until now TL had no crash visibility — a user saying "it crashes" meant an
afternoon of blind reproduction (see the 0.1.27 incident, and the 2026-07-15
warm-state crash we never got a stack for). This build adds:

- **Global fatal-error handler** (`src/services/crashReporter.ts`): wraps
  `ErrorUtils.setGlobalHandler`, chains to RN's own handler. Reports queue in
  AsyncStorage first (max 10), then upload to the shared **`errorLogs`**
  collection tagged `app: 'tracklimits'` — the existing rules already allow
  any signed-in user to create there, so **no rules deploy needed**. A fatal
  crash usually kills the app before the write lands; the queued report
  uploads on the next launch (flushed on auth). Capped at 5 reports/session,
  consecutive-duplicate suppression.
- **Root error boundary** (`app/_layout.tsx`): render crashes anywhere in the
  tree now report (with component stack) and show a "Something went wrong /
  Reload" screen instead of hard-closing — this also breaks the
  resume-into-broken-state loop that force-close was needed for.
- **Demo screen test buttons** (Diagnostics): "render crash" exercises the
  boundary path, "fatal throw" exercises the global-handler path.

Reports include: message, JS stack, component stack (boundary only), app
version, platform + OS version, uid, fatal flag, device timestamp.

Not covered: native-layer crashes (they die before JS runs — logcat only)
and unhandled promise rejections (non-fatal; candidate for a later pass).

## Play "What's new"

Adds automatic crash reporting so we can find and fix issues faster.
