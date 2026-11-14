# Undercut 2.8.0 — release notes

Android versionCode 79 · Amazon versionCode 79 · iOS build 63

Cut 2026-11-13 for the Las Vegas round (lock ~2026-11-21 03:00Z). It carries the owner's playtest
list of 2026-11-13 (F-142 to F-145) and the app halves of F-131 (Pit Wall gold) and F-136 (a held
roster says when it reopens), on top of 2.7.2. Server-side changes since 2.7.2 (auto-fill at lock,
results ingestion for the stand-in seats, live timing, Pit Wall worker fixes) are already live and
need no build.

## Store copy

### English (all stores)

Pit Wall now plans with you. Tap your first drivers and it reads your strategy (Stars, Balanced or Value), then marks a plan for the open seats. Switch any time. After you confirm a lineup, Pit Wall suggests your ace. A driver you can afford is never blocked, only flagged when the rest gets tight. Tap any market driver for details, even outside edit mode. Team names lead, car numbers wear team colours, and a held roster says when it reopens.

### Deutsch (alle Stores)

Pit Wall plant mit dir. Tippe deine ersten Fahrer an, und es erkennt deine Strategie (Stars, Balanced oder Value) und markiert einen Plan für die freien Plätze. Wechsel jederzeit. Nach dem Bestätigen eines Teams schlägt Pit Wall dein Ass vor. Ein bezahlbarer Fahrer wird nie gesperrt, nur markiert, wenn es für den Rest knapp wird. Jeder Fahrer im Markt zeigt Details, auch ohne Bearbeiten. Teamnamen stehen vorn, Startnummern in Teamfarben, und ein gesperrtes Team sagt, wann es wieder öffnet.

### Nederlands (alle stores)

Pit Wall plant nu mee. Tik je eerste coureurs aan en het herkent je strategie (Stars, Balanced of Value) en markeert een plan voor de open plekken. Wissel altijd. Na het bevestigen van een line-up stelt Pit Wall je ace voor. Een betaalbare coureur wordt nooit geblokkeerd, alleen gemarkeerd als het voor de rest krap wordt. Elke coureur in de markt toont details, ook buiten bewerken. Teamnamen staan voorop, startnummers in teamkleuren, en een vergrendeld team zegt wanneer het weer opengaat.

## What actually changed since 2.7.2

- **Pit Wall strategies (F-145, #269).** The drivers added this session say how the lineup is
  being built, measured in price thirds across the market: any top-third pick reads STARS, only
  bottom-third picks read VALUE, anything else BALANCED. A PIT WALL STRATEGY strip under the tabs
  lets the player switch; the plan fills exactly the open driver seats within the bank after the
  cheapest constructor, and its rows carry PIT WALL PLAN. No plan fits → the ordinary pick and
  best-value marks stay.
- **Ace call after confirming (F-143, #267).** A full save in the picker opens the Pit Wall ace
  call once the Team screen is back in front.
- **Playtest fixes (F-142, #266).**
  - The cheapest-finish reserve from 2.7.2 is advice, not a block: a row that leaves too little
    reads TIGHT · LEAVES TOO LITTLE FOR THE REST but can be bought ($5 Bottas with $18 in the bank
    was blocked).
  - Locked or blocked market rows open a read-only details sheet; a long press opens it on any row.
  - Team name first and large, player name small, across the Grid, league and round report.
  - League Moonshot feed is one line: MOONSHOT +N POINTS · TEAM.
  - Surnames skip Jr./Sr./II/III/IV (Sainz showed as "JR").
  - Car numbers 13px bold in team colour on team and league tiles.
- **Pit Wall gold (F-131, #241/#243/#246).** The pick band, ace-call box, Pit Wall block, Team
  screen PIT WALL line and Profile Pass rows use gold `#F0C64A`; warnings move to orange.
- **Held roster (F-136, #256).** After a race the header says RESULTS PENDING / REOPENS IN … /
  REOPENING SOON instead of a lock countdown over dead rows, and a locked team re-reads the server
  on focus.

## Verify before publishing

- Install the Play build from the Play Store on the emulator and launch it signed in (2.7.0 lesson).
- The strategy strip at display size XXL and with the OS font scale up.
- `AIza` present in every bundle (the build scripts check this).
