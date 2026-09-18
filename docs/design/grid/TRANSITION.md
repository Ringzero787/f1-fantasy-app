# Undercut → "Grid" redesign: gap review & transition guide

Source of truth for the new look: the prototype in the handoff zip on the share (5 screens, dark + light; not committed). This document maps the current live UI (`(simple)` panels: Standings · My Team · Market, profile sheet) onto the new design, flags what was left out, and gives implementation instructions.

---

## 1. Gap review — what the current app has that the new design doesn't

Legend: **MIGRATE** = build into the new design before handoff · **FOLD IN** = keep the feature, absorb it into an existing new screen · **DROP** = intentionally not carried over.

| Current feature | Status | Recommendation |
|---|---|---|
| Login screen | FOLD IN | Not redesigned. Reskin the existing login with the new tokens (black/grey, Unbounded headline, red primary button). No new layout needed. |
| Create team (first run: name input) | FOLD IN | New design assumes a team exists. Use the League Manager "New league" screen pattern (label + input + red CTA) for a one-field "Name your team" step. Then land on Team with 6 open slots. |
| Budget cap ($1000) & driver prices | **MIGRATE** | Core game rule, missing from the new Picker. Add a budget line under the Picker header (`BUDGET $877` mono, red when <$50) and a price column per row. Rows you can't afford dim to 35% like blocked rows do now. |
| Contract length 1–6 on add | **MIGRATE** | New design shows contract as 4 dots but has no way to choose it. On tap in the Picker, open a bottom sheet: name, price, 1–6 segmented picker (same style as MAX PLAYERS chips), red "ADD" button. Dot count on the tile = chosen contract length. |
| Ace (double points pick) | **MIGRATE** | One tap-to-toggle star per team. Reuse the AUTO pill style on the tile (`ACE`, white on red fill instead of red outline). One ace max; hidden when locked. |
| Value / Rank stat cells | FOLD IN | Team header currently shows Season pts + Last race. Add `RANK 3/6` as a third cell. Skip "Value" (price total) — low signal for a friends league; it lives in the Picker budget line instead. |
| Market search + sort chips (Price/Points/Name) | FOLD IN | Picker gets one sort toggle in the tab row (`PTS` / `$`). Drop search: 20 drivers + 10 constructors fit one scroll. |
| Member team view (tap a standings row) | **MIGRATE** | Reuse the Team screen read-only: no EDIT link, no open slots, header shows their team name and the row's owner. Cheap and high value for a friends league. |
| Podium colours (gold/silver/bronze) | DROP | New design is deliberately monochrome; your own row is the only accent (red rank). |
| Countdown banner ("Next race 11d 13h") | FOLD IN | Already covered by the header status line (`LOCKS IN 2D 14H` / `LOCKED · QUALI IN 9H`) and the 36-round progress bar. |
| Success banner on complete team | FOLD IN | Covered by `LINEUP · SET` status. No banner. |
| Profile: Game Rules, Race History, Settings, Privacy, Delete account, version, Free Pass pill | FOLD IN | Add as plain rows below APPEARANCE using the existing row style. Destructive rows in red text. Free Pass pill = mono red label under the name (where `P1 · PADDOCK PALS` sits now). |
| Display-scale (accessibility) setting | FOLD IN | Keep. Everything in the new design is on a px scale that multiplies cleanly; see §4 minimums. |
| Swipe between 3 panels | DROP | New design is 2 tabs (TEAM / LEAGUE) + pushed screens (Picker, Profile, League Manager). Keep swipe between the two tabs only if it's already free in the codebase. |
| 4 exploration themes (neon, brutalist, pit…) | DROP | Only dark and light ship. |

Items marked **MIGRATE** are not yet in `grid-prototype.dc.html`. Say which ones you want built and I'll add them before handoff; the guide below already describes how they should look.

---

## 2. Screen map (old → new)

| Old | New screen | Notes |
|---|---|---|
| My Team panel | **Team** | 2-column tile grid replaces stacked rows. Constructor is the 6th tile, red outline. |
| Market panel | **Picker** (`Pick Team`) | Pushed screen from `EDIT →`, not a tab. Drivers / Constructor sub-tabs. |
| Standings panel | **League** | Same data; no avatars, no podium colours. Empty state = "Racing solo" with Create / Join cards. |
| Standings → league header / invite card | **League Manager** | Moved off the standings list into a sub-profile page. |
| Profile sheet | **Profile** | Full screen, not a modal sheet. |
| Create league / Join with code | **League Manager** steps | `none → create | join → done`. |

---

## 3. Design tokens

Replace `simpleTheme.ts` palettes. Keys stay the same where possible; new keys marked ★.

### Dark (default)
| Token | Value | Used for |
|---|---|---|
| background | `#050505` | App canvas |
| surface (screen) ★ | `#0E0E0E` | Screen background |
| card | `#1A1A1A` | Tiles, pills, inputs |
| border | `#232323` | Screen edge, section rules |
| borderLight | `#1E1E1E` | Row separators |
| borderStrong ★ | `#333333` | Dashed open slots, outline buttons, unselected rings |
| text.primary | `#F2F2F2` | |
| text.muted | `#7A7A7A` | Labels, captions (≥4.5:1 on `#0E0E0E`) |
| text.inverse | `#050505` | Text on white buttons |
| primary | `#FF2E2E` | Accent only: status, constructor outline, your rank, AUTO, CTAs |
| positive | `#4ADE80` | ▲ trends |
| negative | `#FF2E2E` | ▼ trends (same as primary) |

### Light
| Token | Value |
|---|---|
| background | `#FFFFFF` |
| surface | `#F4F4F2` |
| card | `#E8E8E5` |
| border | `#D6D6D2` |
| borderLight | `#DDDDD9` |
| borderStrong | `#C8C8C4` |
| text.primary | `#0A0A0A` |
| text.muted | `#6B6B6B` |
| text.inverse | `#FFFFFF` |
| primary | `#FF2E2E` (unchanged) |
| positive | `#15803D` |

Rule: light mode is a straight inversion — anything white-on-black becomes black-on-white (tab pills, avatar chip, selected rings, Copy button). Red and team colours never change.

### Team colours (unchanged from current `TEAM_COLORS`)
McLaren `#FF8000` · Ferrari `#E80020` · Red Bull `#3671C6` · Mercedes `#27F4D2` · Williams `#64C4FF` · Aston Martin `#229971` · Racing Bulls `#6692FF`. Used only as the 28×3 bar on tiles and the 20×3 bar in Picker rows.

### Typography
- **Display / all UI text**: Unbounded (Google Fonts). Weights 900 (names, titles, numerals), 700 (body-ish values), 400 (the one paragraph in League Manager).
- **Data**: JetBrains Mono 700 / 500 for every label, number, code, status and caption.
- Section labels: 11px mono 700, `letter-spacing 0.18em`, uppercase, muted.
- Screen titles: 26px Unbounded 900, `letter-spacing -0.03em`, uppercase.
- Driver name on tile: 19px Unbounded 900, uppercase, single line. Auto-step: >7 chars → 17px, >8 chars → 15px (Verstappen, Antonelli).
- Big season points: 56px 900, `line-height 0.9`, `letter-spacing -0.05em`.
- Standings rank: 30px 900; player name 16px 900 uppercase; points 18px mono 700.
- No italics, no gradients, no shadows, no skewed tabs, no `///` chevrons.

### Shape & spacing
- Screen gutter 24px. Tile gap 10px. Row padding 18px vertical.
- Radii: tiles 18 · small stat cards 14 · inputs 14 · chips 12 · all pills/buttons/avatars 999.
- 1px borders only. Open slot = 1px dashed `borderStrong`, transparent fill.
- Tab bar: `card` track, 4px padding, active segment `text.primary` fill with `text.inverse` label, 12px 900 `letter-spacing 0.08em`.

---

## 4. Component spec

**Header (every screen)** — top row: mono status left (`RD 17 / 36 · BAKU`), red mono status right (`LOCKS IN 2D 14H` / `LOCKED · QUALI IN 9H`). Title row: 26px title + 36px avatar chip (initials) linking to Profile. Team screen only: 3px season progress bar, fill = rounds completed / 36.

**Stat row (Team)** — SEASON PTS 56px left; LAST RACE `+86` 22px red right; 1px rule beneath. Add RANK cell when migrating.

**Lineup label** — `LINEUP · SET` / `LINEUP · 2 OPEN` (red) / `LINEUP · LOCKED`; right side `EDIT →` underlined (red when slots open, muted `LOCKED` when locked).

**Driver tile** 132px tall, `card` fill, radius 18, padding 14.
- Top row: car number (mono muted) + optional `AUTO` pill (9px mono, red outline, 999 radius) · season pts (mono, right).
- Bottom: name · then team-colour bar 28×3 + contract dots (4×4px, gap 3; filled = races left, `borderStrong` = used, red when 1 left) · trend `▲ 25` / `▼ 0` / `• 10` mono right.
- Constructor variant: `background` fill, 1px red border, `TEAM` red mono label instead of number.
- Open slot: dashed border, label `DRIVER`/`TEAM`, red `+` 22px, `ADD DRIVER` / `ADD CONSTRUCTOR` 11px 900 muted. Tap → Picker.

**Picker row** — grid `36px 1fr auto 28px`: number · name (16px 900) + colour bar + team (mono) · pts 15px mono + trend · 28px ring (unselected: 1px `borderStrong`; selected: white fill, black ✓). Blocked (5/5 full and not selected, or locked) = 35% opacity, no tap.
Save button: `card`/muted when incomplete (`PICK 2 MORE`), red/white when ready (`SAVE LINEUP`), `LOCKED · AUTO-FILL ON` when locked.

**Standings row** — grid `44px 1fr auto`: rank 30px (red for you) + movement `▲ 1` / `▼ 2` / `—` 10px mono · name + team · points + `LEADER` (red) or gap `-33`. Sort toggle SEASON / LAST RACE in the column header.

**League Manager** — 4 steps in one screen: choose (two cards) → join (code input, mono 22px, uppercase) or create (name input + MAX PLAYERS 6/8/10/12 chips) → manage (invite code card: red outline, 34px mono code, `n / max PLAYERS`; EMAIL · SMS · COPY buttons; settings rows; red `DELETE LEAGUE` / `LEAVE LEAGUE` text link at bottom).

**Profile** — 72px avatar + name + red mono status line (`P1 · PADDOCK PALS`). Rows: NAME, TEAM NAME, AVATAR, LEAGUE (`Join or create` in red until joined), APPEARANCE (DARK / LIGHT pill). 3 small stat cards: RACES `17/36`, AVG / RACE, BEST. Outline SIGN OUT pill.

Minimums: tap targets ≥ 44px (rows, tiles, rings sit inside 44px rows); text ≥ 10px mono only for captions; body ≥ 11px.

---

## 5. States & behaviour

- **Lock**: 12h before qualifying, `locked = true`. Effects: header status, EDIT → LOCKED, Picker rows non-interactive, Save button → `LOCKED · AUTO-FILL ON`.
- **Auto-fill**: after lock, any empty slot is filled server-side; that tile shows the `AUTO` pill until the next unlock. (Rule for which driver is auto-added is a backend decision.)
- **Contracts**: each pick carries `racesLeft`; tile dots = `racesLeft` out of contract length. At 0 the pick expires and the slot becomes open at the next unlock.
- **Open slots**: `5 - drivers.length` driver slots + `constructor ? 0 : 1`; header shows `N OPEN` in red.
- **League empty state**: LEAGUE tab with no league shows "Racing solo" + Create / Join cards, which open League Manager at the matching step.
- **Theme**: `dark | light`, persisted; toggle lives in Profile → APPEARANCE.
- **Invite copy**: clipboard write, button label → `COPIED` for 1.5s.
- Trends: ▲/▼ compare last race to the race before; standings movement compares position before/after the last race.

---

## 6. Suggested order of work
1. Swap tokens + fonts (Unbounded, JetBrains Mono via expo-font). Remove italics/skews/gradients/shadows.
2. Team screen tile grid + lock/open/AUTO states.
3. Picker (replaces Market) — including budget + contract sheet if migrated.
4. League tab + empty state; League Manager.
5. Profile.
6. Reskin login / create-team with tokens only.
7. QA both themes, default and max display scale: Team (full / 2 open / locked), Picker (drivers / constructors / locked), League (in league / solo), League Manager (all 4 steps), Profile.
