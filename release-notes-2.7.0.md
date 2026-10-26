# Undercut 2.7.0 — release notes

Android versionCode 74 · Amazon versionCode 74 · iOS build 58

Cut 2026-10-26 for the Mexico City round (qualifying 2026-10-31, race 2026-11-01). Google Play is
on 2.6.0, so its notes carry only what is new here. The App Store never received a 2.6.0 build (it
is on 2.5.3), and Amazon's last upload predates it too, so their notes also carry 2.6.0's items.

## Store copy

**Three versions by store.** Google Play saw 2.6.0; the App Store and Amazon did not. Nothing here
is platform-specific, so no store text names another platform.

German and Dutch keep the informal register the rest of the listing uses, and the catalog's word for
the ace (Ass / ace).

---

### English — Google Play (from 2.6.0)

The market stays open while your lineup is locked: open MARKET from the team row to read prices, points and projections right through the race weekend. Your Moonshot now shows in the weekend recap, with roster, Moonshot and weekend totals added up, and the Moonshot counter counts a token when the call locks, not when you place it. Pit Wall's ace call is the first thing in the driver sheet, with MAKE ACE right there.

### English — App Store and Amazon (from 2.5.3)

The market stays open while your lineup is locked: open MARKET from the team row to read prices, points and projections right through the race weekend. Your Moonshot now shows in the weekend recap, with the totals added up, and the Moonshot counter counts a token when the call locks. Pit Wall is open to every signed-in player and its ace call is the first thing in the driver sheet. The picker shows value and leftover budget, and the round report shares as a picture.

### Deutsch — Google Play (ab 2.6.0)

Der Markt bleibt offen, auch wenn dein Team gesperrt ist: Öffne MARKET in der Teamzeile und lies Preise, Punkte und Prognosen das ganze Rennwochenende lang. Dein Moonshot steht jetzt im Wochenend-Rückblick, mit Team, Moonshot und Wochenende zusammengerechnet, und der Moonshot-Zähler zählt einen Token, sobald der Call gesperrt wird, nicht schon beim Setzen. Der Ass-Tipp von Pit Wall steht ganz oben im Fahrerblatt, mit MAKE ACE direkt dabei.

### Deutsch — App Store und Amazon (ab 2.5.3)

Der Markt bleibt offen, auch wenn dein Team gesperrt ist: Öffne MARKET in der Teamzeile und lies Preise, Punkte und Prognosen das ganze Rennwochenende lang. Dein Moonshot steht jetzt im Wochenend-Rückblick, zusammengerechnet, und der Moonshot-Zähler zählt einen Token, sobald der Call gesperrt wird. Pit Wall ist für alle angemeldeten Spieler offen, und sein Ass-Tipp steht ganz oben im Fahrerblatt. Die Auswahl zeigt Wert und Restbudget, und der Rundenbericht lässt sich als Bild teilen.

### Nederlands — Google Play (vanaf 2.6.0)

De markt blijft open terwijl je line-up vergrendeld is: open MARKET op de teamrij en lees prijzen, punten en verwachtingen het hele raceweekend door. Je Moonshot staat nu in je weekendoverzicht, met team, Moonshot en weekend bij elkaar opgeteld, en de Moonshot-teller telt een token zodra de call vergrendelt, niet al bij het plaatsen. Het ace-advies van Pit Wall staat bovenaan in het coureurblad, met MAKE ACE er direct bij.

### Nederlands — App Store en Amazon (vanaf 2.5.3)

De markt blijft open terwijl je line-up vergrendeld is: open MARKET op de teamrij en lees prijzen, punten en verwachtingen het hele raceweekend door. Je Moonshot staat nu in je weekendoverzicht, bij elkaar opgeteld, en de Moonshot-teller telt een token zodra de call vergrendelt. Pit Wall is open voor elke ingelogde speler en zijn ace-advies staat bovenaan in het coureurblad. De kiezer toont waarde en resterend budget, en het rondeverslag deel je als afbeelding.

---

## What actually changed

**F-125 — the market is reachable while locked (#227).** The picker was reachable only through
EDIT, which the lock disables, so for a whole race weekend nobody could look at prices, points or
projections. MARKET sits on the team-switcher row with no lock gate. Opened while locked it is a
market to read: every row at full strength and unresponsive, the save bar reads LOCKED · AUTO-FILL
ON. After the race's lock time only this race's existing Moonshot keeps its rocket.

**F-126 — the Moonshot counter moves at lock (#227).** A token counts as spent when its call locks,
not when it is confirmed, since an open call can still be cancelled for a full refund: ONE IN PLAY ·
COUNTS WHEN SELECTIONS LOCK before the lock, ONE USED THIS WEEKEND after it. The server's token
accounting is untouched (it still spends at confirm, which is what stops two calls on one token).

**F-127 — the Moonshot in the weekend recap (#229).** A card between the weekend's points and the
scorers: the call, the driver's finish, the points, bordered in the outcome's colour; and one line
that adds roster and Moonshot into a weekend total. A cash stake is named as cash, never added to
points; a void says the token came back. The hero number stays the roster's points, which the
league table ranks on.

**F-119 follow-up — the ace call first (#225).** Pit Wall's ACE CALL is the first block in the
driver sheet, directly under the driver's name and team; when the call is to ace this driver and
the player can act, MAKE ACE · 2× POINTS sits in that block and the bottom pill is not rendered.

**F-129 — the race-day running score, in the build but switched off (#231).** While a race runs,
each tile's trend corner becomes a pulsing LIVE +N (the Ace doubled) and the LAST RACE stat becomes
LIVE · SO FAR with the roster's total: our scoring formula over the provider's running order, a
running score and not a result. Nothing shows until `config/app.moonshot.liveTiming` is on, and
that waits for the timing provider's written confirmation (ADR-001). Not in the store copy for
that reason.

**Server side, already live, no build needed:** F-128 (the results, qualifying and sprint ingests
authenticate to the timing feed, so results no longer wait hours for the provider's free tier to
reopen; deployed OP-182) and the F-129 sweep (OP-184, inert).

### Native changes in this build
None. No new native module, font, image or permission since 2.6.0.

### Not proven by this release run
- The live-score tiles on a device: verified on Expo web with a forced document (dark and light
  screenshots in `docs/design/grid/verify/F-129-*.png`); nothing can show on a device until the
  switch is on.
- The recap's Moonshot card on a live account (the recap appears only when one is due; verified
  on web through a throwaway forced path).
- The market-while-locked screen on a device (verified on web with the browser clock moved
  across the lock).

### Known
- The round report and the recap's new lines are in English in every language; localizing them
  is a follow-up.
- A Moonshot model for Mexico City is not seeded yet (no MODELS_12 doc); the app carries the
  United States model forward, as designed.

## Platform notes
- **Google Play**: versionCode 74. 73 (2.6.0) is live on production, beta, alpha and internal.
- **Amazon Appstore**: versionCode 74, title "Undercut: Fantasy Motorsport" in both title fields
  (`docs/store/amazon-listing.md`).
- **iOS**: build 58. Build 56 (2.5.3) is the one in the store's review queue; 57 was reserved by
  the 2.6.0 bump and never built.
- **`config/app.minVersion` is untouched** (2.3.2). Nothing here needs a forced update.
