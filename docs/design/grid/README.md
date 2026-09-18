# Handoff: Undercut — "Grid" redesign (black / grey / red)

## Overview
Full visual redesign of the Undercut fantasy F1 app's live `(simple)` UI. Five screens: Team, League (standings), Pick Team (replaces Market), Profile, League Manager (join / create / invite). Dark and light themes. Scope of features, gap review against the current app, and every token/spec is in **TRANSITION.md** — read it first.

## About the Design Files
The interactive prototype (`F1 Fantasy.dc.html` + its `support.js` runtime) is **not committed** — open it from the handoff zip on the share (`Z:\share\undercut\F1 Fantasy App Design.zip`, `/mnt/smb/share/undercut/` on the build box). It is a **design reference built in HTML**. It is an interactive prototype showing intended look and behavior, **not production code**. Recreate the screens in the existing Undercut stack (Expo / React Native, `src/simple/**`, `useSimpleTheme()` tokens) using its established patterns. Do not touch `app/(tabs)/**` or `src/config/themes.ts`.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and states are final. Recreate pixel-perfectly. Exact values are in TRANSITION.md §3–§4; the HTML is the tie-breaker when the doc and the prototype differ.

## How to read the prototype
- The canvas shows all five phone screens side by side (390×844 each). Screens link to each other: avatar chip → Profile; `EDIT →` → Pick Team; Profile → LEAGUE row → League Manager; League tab empty state → League Manager.
- Tweaks (top of file, `data-props`): `theme` dark/light · `locked` true/false · `showCarNumbers` · `sortLeagueBy` season/last · `leagueState` none/join/create/done. Toggle these to see every state.
- Interactive: tap Picker rows to (de)select drivers and watch the Team grid show open slots; League Manager inputs and buttons work; DARK/LIGHT switch in Profile.
- All styling is inline on the elements — inspect any element to read its exact values. CSS variables (`--fg`, `--muted`, `--surface`, …) are defined at the top of the file for both themes.
- Logic (data shape, derived states, lock/auto/open-slot rules) is in the `class Component` block at the bottom of the file.

## Screens
See TRANSITION.md §2 (screen map), §4 (component spec), §5 (states & behavior).

## Not yet designed (see TRANSITION.md §1)
Budget + prices, contract-length picker, Ace pick, and friend team view were recommended for migration but are not in the prototype. Implement from the written spec in §1 or wait for updated design files.

## Design Tokens
TRANSITION.md §3. Fonts: Unbounded (400/700/900) and JetBrains Mono (500/700) from Google Fonts — load via `expo-font`.

## Assets
None. No icons or bitmaps; arrows/checks/triangles are text glyphs (`→ ← › + ✓ ▲ ▼ •`). Team colours from existing `TEAM_COLORS`.

## Files
- prototype + runtime — in the handoff zip on the share (see above)
- `TRANSITION.md` — gap review, screen map, tokens, component spec, behavior, work order
