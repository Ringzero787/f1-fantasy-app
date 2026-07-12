# Track Limits 0.1.28

**versionCode:** 29
**versionName:** 0.1.28
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`

**Emergency fix — replaces 0.1.27 (vc28), which instant-crashed on launch.**

## What was wrong with 0.1.27

The vc28 AAB shipped with the **wrong JavaScript bundle inside**: Undercut's
app code was packaged into the Track Limits native shell. Undercut's root
layout imports `expo-screen-orientation`, a native module Track Limits does
not link, so the app threw `Cannot find native module 'ExpoScreenOrientation'`
and died before first render.

Root cause: `newgame/` had no `metro.config.js`, and Metro searches parent
directories for its config — so TL builds silently picked up the repo root's
(Undercut's) `metro.config.js`, added 2026-07-05, whose `projectRoot` is the
repo root. expo-router then bundled the root `app/` directory. Any TL build
made after that date was affected regardless of the working directory the
build ran from.

## The fix

- `newgame/metro.config.js` added (`getDefaultConfig(__dirname)`), pinning
  the Metro project root to the Track Limits project. Do not delete it while
  the repo root has its own metro config.
- No app-code changes vs 0.1.27. JS payload is identical to what 0.1.27 was
  *supposed* to contain (settled-tile treatments, gold staked-win, solo-league
  card, profile season-pts fix — commits afc1dd9, 1195229, 6359f30, f077e91).

## Play "What's new"

Fixes an issue where the app could crash immediately on launch after updating.
