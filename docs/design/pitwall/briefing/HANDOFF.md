# Pitwall Briefing — design handoff

Redesign of the Pitwall web **Briefing** tab to match the Undercut mobile app (edgy, wide black display type, mono labels, single red accent).

## Files
- `Main.dc.html` — dark theme (reference for layout + behavior)
- `Light.dc.html` — light theme (same layout, light tokens)
- `canvas.json` — canvas index (ignore for implementation)

The `.dc.html` files are design-tool components: markup inside `<x-dc>` with `{{hole}}` bindings, `<sc-for>` (loops) and `<sc-if>` (conditionals); the logic class at the bottom (`renderVals()`) holds the data and interaction state. Treat them as a spec: port markup/styles into the app's real components and wire the data to live sources. All numbers are taken from the 3 Oct (RD 18 Sepang) screenshots.

## Tokens
| Token | Dark | Light |
|---|---|---|
| Background | `#0A0A0A` | `#F4F4F2` |
| Surface (cards, nav, wire) | `#161616` | `#E8E8E5` |
| Raised (tiles, stat cells) | `#1C1C1C` / `#1E1E1E` | `#FFFFFF` / `#F1F1EE` |
| Text | `#F4F4F4` | `#0A0A0A` |
| Secondary text | `#BDBDBD` | `#3F3F3C` |
| Muted text / labels | `#8C8C8C` | `#6A6A66` |
| Dividers | `#262626` | `#D6D6D2` |
| Accent (red) | `#FF2B2B`, ink on it `#0A0A0A` | `#E5161C`, ink on it `#FFFFFF` |
| Up / positive | `#3DDC84` | `#138A3E` |

Type: **Archivo** at `font-stretch: 125%`, weight 800–900, uppercase, tight negative tracking for display; **JetBrains Mono** for body/labels (labels uppercase, 0.16–0.24em tracking). Radii: 28px panels, 20–22px tiles, 14–18px stat cells, pills fully round. Touch targets ≥ 44px.

Team colors (lines only): Ferrari `#E8002D`, Red Bull `#3671C6`, Racing Bulls `#6C98FF`, Sauber `#52E252`, Mercedes `#27F4D2`, Alpine `#0093CC` / Gasly `#FF87BC`.

## Page structure (top → bottom)
1. Top bar: PITWALL wordmark, data timestamp, theme toggle (sun/moon), sign out, avatar.
2. Round strip + season progress bar (18/24).
3. Hero: team name, season pts, last race, rank, bank · red-outlined "This weekend" card (projected 264, range, rate, flags, Open Lineup Lab CTA).
4. Section nav as a pill segmented control (scrolls horizontally on narrow screens).
5. **The calls** — compact strip of 4 call tiles (see behavior).
6. The wire (news feed with tag, team color, source link, vote/read buttons) + Lineup tiles (2×3, mirrors mobile) + Price movers.

## The calls — interaction spec
State: `hover` (tile index | null), `pinned` (index | -1, default 0 for the mock), `expanded` (bool).
- **Hover** a tile with comparison data → floating **peek** callout (440px, anchored under the tile; left-aligned for tiles 1–2, right-aligned for 3–4). Peek is suppressed while another tile's locked callout is showing.
- **Click** a tile → **lock** it (accent border + lock icon); callout stays open with **Expand** and **✕** (unlock). Clicking the locked tile again unlocks.
- **Expand** → hides the callout and shows a full-width, in-flow panel under the strip: matchup header, 8 stat cells (floor→ceiling range + 7 stats: Hadjar big, Gasly small, winner bar), verdict, actions. **Collapse** returns to the locked callout; **✕** unlocks.
- Only calls with comparison data (`compare: true` — Ace, Risk) open a callout; others just lock.
- Stat winner rule: `hi` = higher wins, `lo` = lower wins (DNF risk, price), `null` = neutral (league owned).

## Responsive
Fluid page, max-width 1440. Rows use flex-wrap / auto-fit grids, so columns stack at phone width; nav scrolls; callout width clamps to `100vw - 32px`.
