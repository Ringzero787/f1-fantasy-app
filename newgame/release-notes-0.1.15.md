# Track Limits 0.1.15

**versionCode:** 16
**versionName:** 0.1.15
**AAB:** `android/app/build/outputs/bundle/release/app-release.aab`

## Lineup screen — design pass

Aligned the Lineup screen to the Claude Design handoff (`lineup_handoff/`):

- **WITH / AGAINST toggle rewritten** as a single tap-to-flip pill (instead of two separate buttons). One tap anywhere on the pill flips the pick — no more confused per-half tap targets or stuck states. WITH active fills cornflower (`#7C9CFF`), AGAINST active fills sage (`#9CAF88`).
- **AGAINST treatment is now sage**, not red. Toggle fill, card border (1.5 px), section header `AGAINST · N` count, and status footer all match.
- **Sage wash gradient** on cards when AGAINST — soft left-to-right fade (uses new `expo-linear-gradient` dependency).
- **StakeSheet side flip now reflects on the lineup immediately**, not only when you save. Cancel still cancels the stake, but the new side is already persisted.

## Constructor predictions

Fixed the misleading "P22-P30" display on constructor rows. Constructor predictions are internally the **sum of both drivers' finishing positions** (range 1-44); we now divide by 2 for display and label it `P11-P15 avg` so users see a realistic grid range. Scoring math is unchanged.

## Navigation

Replaced the bottom tab bar text with **icons only** (labels were truncating to `LIN…`, `GAR…`, `LEA…` on phone widths):

- Lineup → checkered flag
- Garage → garage
- Shop → cart
- League → trophy
- You → account circle

Accent dot still indicates the active tab.

## Files touched

- `app.config.js`, `android/app/build.gradle` — version bump 0.1.14→0.1.15
- `package.json`, `package-lock.json` — added `expo-linear-gradient`
- `src/components/tl/atoms.tsx` — `WithAgainstToggle` rewrite, `BEN_AGAINST` / `BEN_AGAINST_WASH` exports, `BenLinePill` `kind` prop with constructor halving
- `src/components/tl/index.ts` — re-exports
- `src/components/sheets/StakeSheet.tsx` — `onFlipSide` callback, constructor halving in inline prediction
- `app/(tabs)/_layout.tsx` — icon-only tab bar
- `app/(tabs)/index.tsx` — sage colors, sage gradient row overlay, `kind` on pill, `onFlipSide` wired to picks service, callers switched from `onSelect` to `onFlip`
- `app/results.tsx` — `kind` on pill

## Play Console "What's new" (≤500 chars)

```
v0.1.15 — Lineup polish

• WITH/AGAINST toggle redesigned: one-tap flip, sage AGAINST treatment, card highlight + soft gradient
• Constructor predictions now show per-car average (e.g. "P11–P15 avg") instead of confusing sum ranges
• Side changes inside the stake sheet apply to the lineup immediately
• Bottom tab bar swapped to icons only — Lineup / Garage / Shop / League / You
• Tooltip on Ben's pill clarifies how the bet resolves
```
