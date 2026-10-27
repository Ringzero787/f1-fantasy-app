# Undercut 2.7.2 — release notes

Android versionCode 78 · Amazon versionCode 78 · iOS build 62

Cut 2026-10-27, the same evening as 2.7.1, for the Mexico City round (lock 2026-10-31). It carries
one change on top of 2.7.1: the Pick Team fixes from PR #238, found by the owner while picking on
2.7.1. 2.7.1 is still the crash fix for 2.7.0 (see `release-notes-2.7.1.md`); where 2.7.1 has not
reached players yet (App Store: 2.7.1 was waiting for review when 2.7.2 was cut; Amazon: the 2.7.1
APK was with the owner), 2.7.2 replaces it and the notes keep the crash-fix line.

## Store copy

### English — Google Play (from 2.7.1)

Pick Team now keeps the constructor in mind: a driver you could not finish the lineup after is held back, the budget line counts the constructor as a seat, and Pit Wall's pick is a highlighted row with its label on its own line. Your picks save as you go, even before the lineup is complete, with the open seats named in the summary; leaving with unsaved picks asks first. Also in 2.7.x: the crash-at-launch fix, the weekend recap from your scored record, and the market open through the lock.

### English — App Store (from 2.7.0, which was released; 2.7.1 did not ship)

Fixes the crash at launch in 2.7.0. Pick Team keeps the constructor in mind: a driver you could not finish the lineup after is held back, the budget line counts the constructor as a seat, and Pit Wall's pick is a highlighted row. Your picks save as you go, even before the lineup is complete, and leaving with unsaved picks asks first. The weekend recap shows your points as scored, pick by pick, your place in the round and the season, and the next round with your Moonshot on it. The market stays open while your lineup is locked, and Pit Wall is open to every signed-in player.

### English — Amazon (from 2.5.3)

Pick Team keeps the constructor in mind: a driver you could not finish the lineup after is held back, the budget line counts the constructor as a seat, and Pit Wall's pick is a highlighted row. Your picks save as you go, even before the lineup is complete, and leaving with unsaved picks asks first. The weekend recap shows your points as scored, pick by pick, your place in the round and the season, and the next round with your Moonshot on it. The market stays open while your lineup is locked, and Pit Wall is open to every signed-in player with its ace call first in the driver sheet.

### Deutsch — Google Play

Pick Team denkt jetzt an den Konstrukteur: Ein Fahrer, nach dem du das Team nicht mehr vervollständigen könntest, wird zurückgehalten, die Budgetzeile zählt den Konstrukteur als Platz, und der Tipp von Pit Wall ist eine hervorgehobene Zeile. Deine Picks werden gespeichert, auch bevor das Team vollständig ist, und wer mit ungespeicherten Picks geht, wird gefragt. Außerdem in 2.7.x: der Absturz beim Start behoben, der Rückblick aus deiner Wertung, der Markt während der Sperre offen.

### Deutsch — App Store (ab 2.7.0)

Behebt den Absturz beim Start in 2.7.0. Pick Team denkt an den Konstrukteur: Ein Fahrer, nach dem du das Team nicht mehr vervollständigen könntest, wird zurückgehalten, die Budgetzeile zählt den Konstrukteur als Platz, und der Tipp von Pit Wall ist eine hervorgehobene Zeile. Deine Picks werden gespeichert, auch bevor das Team vollständig ist, und wer mit ungespeicherten Picks geht, wird gefragt. Der Wochenend-Rückblick zeigt deine Punkte wie gewertet, Pick für Pick, deinen Platz in Runde und Saison und die nächste Runde mit deinem Moonshot. Der Markt bleibt während der Sperre offen, und Pit Wall ist für alle angemeldeten Spieler offen.

### Deutsch — Amazon (ab 2.5.3)

Pick Team denkt an den Konstrukteur: Ein Fahrer, nach dem du das Team nicht mehr vervollständigen könntest, wird zurückgehalten, die Budgetzeile zählt den Konstrukteur als Platz, und der Tipp von Pit Wall ist eine hervorgehobene Zeile. Deine Picks werden gespeichert, auch bevor das Team vollständig ist, und wer mit ungespeicherten Picks geht, wird gefragt. Der Wochenend-Rückblick zeigt deine Punkte wie gewertet, Pick für Pick, deinen Platz in Runde und Saison und die nächste Runde mit deinem Moonshot. Der Markt bleibt während der Sperre offen, und Pit Wall ist für alle angemeldeten Spieler offen, mit seinem Ass-Tipp ganz oben im Fahrerblatt.

### Nederlands — Google Play

Pick Team houdt nu rekening met de constructeur: een coureur waarna je de line-up niet meer af zou krijgen wordt tegengehouden, de budgetregel telt de constructeur als een plek, en de tip van Pit Wall is een gemarkeerde rij. Je picks worden opgeslagen, ook voordat de line-up compleet is, en wie weggaat met niet-opgeslagen picks krijgt eerst een vraag. Ook in 2.7.x: de crash bij het opstarten verholpen, het weekendoverzicht uit je telling, de markt open tijdens de vergrendeling.

### Nederlands — App Store (vanaf 2.7.0)

Verhelpt de crash bij het opstarten in 2.7.0. Pick Team houdt rekening met de constructeur: een coureur waarna je de line-up niet meer af zou krijgen wordt tegengehouden, de budgetregel telt de constructeur als een plek, en de tip van Pit Wall is een gemarkeerde rij. Je picks worden opgeslagen, ook voordat de line-up compleet is, en wie weggaat met niet-opgeslagen picks krijgt eerst een vraag. Het weekendoverzicht toont je punten zoals geteld, per pick, je plaats in de ronde en het seizoen, en de volgende ronde met je Moonshot. De markt blijft open tijdens de vergrendeling, en Pit Wall is open voor elke ingelogde speler.

### Nederlands — Amazon (vanaf 2.5.3)

Pick Team houdt rekening met de constructeur: een coureur waarna je de line-up niet meer af zou krijgen wordt tegengehouden, de budgetregel telt de constructeur als een plek, en de tip van Pit Wall is een gemarkeerde rij. Je picks worden opgeslagen, ook voordat de line-up compleet is, en wie weggaat met niet-opgeslagen picks krijgt eerst een vraag. Het weekendoverzicht toont je punten zoals geteld, per pick, je plaats in de ronde en het seizoen, en de volgende ronde met je Moonshot. De markt blijft open tijdens de vergrendeling, en Pit Wall is open voor elke ingelogde speler met zijn ace-advies bovenaan in het coureurblad.

## What actually changed since 2.7.1 (PR #238)

- **The picker holds back the cheapest finish.** A driver counted as affordable when its price fit
  the cash left, with nothing held back for the seats still open, so four Pit Wall drivers on $65
  left no constructor the player could buy, and Pit Wall (which only ranks what the picker allows)
  marked the very driver that caused it. A row is now affordable only if the cheapest finish for
  the open seats, the constructor included while none is picked, still fits after it. The leftover
  line reads `LEAVES $65 FOR 1 SLOT + CONSTRUCTOR · CHEAPEST FILL $25` and the LEAVES badge says
  what the money is for. The constructor tab holds back the cheapest driver fill the same way.
- **Partial lineups save.** SAVE LINEUP waited for five drivers and a constructor, so a player
  with four picks had to pick a constructor they could not afford before anything was kept. A
  changed lineup now saves as it is; the summary says `1 DRIVER + CONSTRUCTOR STILL OPEN ·
  AUTO-FILLS AT LOCK` (or `BANK TOO LOW TO FILL AT LOCK`), and a plan the bank cannot cover reads
  OVER BUDGET. CANCEL, the hardware back and the iOS swipe with unsaved picks open the summary with
  CONFIRM / LEAVE WITHOUT SAVING / KEEP EDITING instead of dropping them.
- **Pit Wall's pick is the row.** The `PIT WALL PICK` badge sat beside the team name and ran under
  the projection column. The pick row is now a faint band across the screen with the accent on the
  edge and the label on its own line above the name; BEST VALUE and the pairing hints wrap on a
  line below the team name.

## Platform notes
- **Google Play**: versionCode 78 to production and every testing track, replacing 77.
- **Amazon Appstore**: versionCode 78; replaces whichever 2.7.x APK is in the submission.
- **iOS**: build 62 on the 2.7.2 version; 2.7.1 (build 61) was waiting for review when this was
  cut and is to be withdrawn in its favour.
- **`config/app.minVersion` is untouched** (2.3.2).
