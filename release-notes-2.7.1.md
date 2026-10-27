# Undercut 2.7.1 — release notes

Android versionCode 76 · Amazon versionCode 76 · iOS build 60

Cut 2026-10-27, the day after 2.7.0. **2.7.0 crashes at launch on every platform**: it was built
from a worktree that had every untracked input except `.env`, so the Firebase web config was
inlined as empty strings and the app throws `auth/invalid-api-key` before the first screen. 2.7.1
is that code built with the config present, a guard in the three build scripts so a bundle without
a Firebase web API key can never be produced again, and one app change the owner asked for the
same morning: a weekend recap that is actually useful (F-130).

Who saw 2.7.0: Google Play players (vc74 went to production and every testing track on
2026-10-26) **and App Store players: Apple approved and released 2.7.0 (build 58) overnight**, so
it was READY_FOR_SALE by the morning of 2026-10-27. Amazon's vc74 submission was withdrawn before
it went live, so Amazon goes from its earlier version straight to 2.7.1. The Play and App Store
notes therefore both open with the crash fix; Amazon's do not. VersionCode 75 / iOS build 59 were
a throwaway 2.7.1 cut made before F-130 landed; never published (build 59 sits unused in App
Store Connect).

## Store copy

### English — Google Play (from 2.7.0 / 2.6.0)

Fixes the crash at launch in 2.7.0. The weekend recap now shows your points as scored, pick by pick, your place in the round and the season, and the next round with your Moonshot on it. The market stays open while your lineup is locked: open MARKET from the team row to read prices, points and projections through the race weekend. The Moonshot counter counts a token when the call locks, and Pit Wall's ace call is first in the driver sheet, with MAKE ACE right there.

### English — App Store (from 2.7.0, which was released)

Fixes the crash at launch in 2.7.0. The weekend recap now shows your points as scored, pick by pick, your place in the round and the season, and the next round with your Moonshot on it. The market stays open while your lineup is locked: open MARKET from the team row to read prices, points and projections right through the race weekend. The Moonshot counter counts a token when the call locks. Pit Wall is open to every signed-in player and its ace call is the first thing in the driver sheet. The picker shows value and leftover budget, and the round report shares as a picture.

### English — Amazon (from 2.5.3)

The weekend recap now shows your points as scored, pick by pick, your place in the round and the season, and the next round with your Moonshot on it. The market stays open while your lineup is locked: open MARKET from the team row to read prices, points and projections right through the race weekend. The Moonshot counter counts a token when the call locks. Pit Wall is open to every signed-in player and its ace call is the first thing in the driver sheet. The picker shows value and leftover budget, and the round report shares as a picture.

### Deutsch — Google Play

Behebt den Absturz beim Start in 2.7.0. Der Wochenend-Rückblick zeigt jetzt deine Punkte wie gewertet, Pick für Pick, deinen Platz in Runde und Saison und die nächste Runde mit deinem Moonshot. Der Markt bleibt offen, auch wenn dein Team gesperrt ist: Öffne MARKET in der Teamzeile und lies Preise, Punkte und Prognosen das ganze Rennwochenende lang. Der Moonshot-Zähler zählt einen Token, sobald der Call gesperrt wird, und der Ass-Tipp von Pit Wall steht ganz oben im Fahrerblatt, mit MAKE ACE.

### Deutsch — App Store (ab 2.7.0)

Behebt den Absturz beim Start in 2.7.0. Der Wochenend-Rückblick zeigt jetzt deine Punkte wie gewertet, Pick für Pick, deinen Platz in Runde und Saison und die nächste Runde mit deinem Moonshot. Der Markt bleibt offen, auch wenn dein Team gesperrt ist: Öffne MARKET in der Teamzeile und lies Preise, Punkte und Prognosen das ganze Rennwochenende lang. Der Moonshot-Zähler zählt einen Token, sobald der Call gesperrt wird. Pit Wall ist für alle angemeldeten Spieler offen, und sein Ass-Tipp steht ganz oben im Fahrerblatt. Die Auswahl zeigt Wert und Restbudget, und der Rundenbericht lässt sich als Bild teilen.

### Deutsch — Amazon (ab 2.5.3)

Der Wochenend-Rückblick zeigt jetzt deine Punkte wie gewertet, Pick für Pick, deinen Platz in der Runde und in der Saison und die nächste Runde mit deinem Moonshot. Der Markt bleibt offen, auch wenn dein Team gesperrt ist: Öffne MARKET in der Teamzeile und lies Preise, Punkte und Prognosen das ganze Rennwochenende lang. Der Moonshot-Zähler zählt einen Token, sobald der Call gesperrt wird. Pit Wall ist für alle angemeldeten Spieler offen, und sein Ass-Tipp steht ganz oben im Fahrerblatt. Die Auswahl zeigt Wert und Restbudget, und der Rundenbericht lässt sich als Bild teilen.

### Nederlands — Google Play

Verhelpt de crash bij het opstarten in 2.7.0. Het weekendoverzicht toont nu je punten zoals geteld, per pick, je plaats in de ronde en in het seizoen, en de volgende ronde met je Moonshot. De markt blijft open terwijl je line-up vergrendeld is: open MARKET op de teamrij en lees prijzen, punten en verwachtingen het hele raceweekend door. De Moonshot-teller telt een token zodra de call vergrendelt, en het ace-advies van Pit Wall staat bovenaan in het coureurblad, met MAKE ACE er direct bij.

### Nederlands — App Store (vanaf 2.7.0)

Verhelpt de crash bij het opstarten in 2.7.0. Het weekendoverzicht toont nu je punten zoals geteld, per pick, je plaats in de ronde en in het seizoen, en de volgende ronde met je Moonshot. De markt blijft open terwijl je line-up vergrendeld is: open MARKET op de teamrij en lees prijzen, punten en verwachtingen het hele raceweekend door. De Moonshot-teller telt een token zodra de call vergrendelt. Pit Wall is open voor elke ingelogde speler en zijn ace-advies staat bovenaan in het coureurblad. De kiezer toont waarde en resterend budget, en het rondeverslag deel je als afbeelding.

### Nederlands — Amazon (vanaf 2.5.3)

Het weekendoverzicht toont nu je punten zoals geteld, per pick, je plaats in de ronde en in het seizoen, en de volgende ronde met je Moonshot. De markt blijft open terwijl je line-up vergrendeld is: open MARKET op de teamrij en lees prijzen, punten en verwachtingen het hele raceweekend door. De Moonshot-teller telt een token zodra de call vergrendelt. Pit Wall is open voor elke ingelogde speler en zijn ace-advies staat bovenaan in het coureurblad. De kiezer toont waarde en resterend budget, en het rondeverslag deel je als afbeelding.

## What actually changed since 2.7.0

- **The Firebase web config is in the bundle.** The 2.7.0 features are unchanged; see
  `release-notes-2.7.0.md` for them (F-125, F-126, F-127, #225, F-129 switched off).
- **F-130 — the weekend recap from the round record.** The recap used to score the roster as it
  stands today against the race's neutral points, so a driver sold after the race vanished from
  "your" weekend and a one-driver roster read as the same number three times. It now reads the
  team's race snapshot (F-029) and the league's leaderboard for the race (F-062): the points the
  server credited, pick by pick, with ACE ×2, TEAM and AUTO marked; picks that scored 0 on one
  line; FIELDED n OF 6 when slots were open; the stale-roster penalty as its own line; ROUND P4 / 10
  with the gap to the round's winner (or ROUND WINNER); SEASON P2 / 10 with ▲/▼ movement; the
  settled Moonshot card (F-127) as before; and a closing NEXT block with the round, its lock and
  the team's Moonshot on it (in play, locked, or how many shots are left). With no record it falls
  back to the roster as it is now and says so. The card names the team (TEAM 1 / 2) and a
  two-team player gets one recap per team: "seen" is kept per team, and the closing button turns
  into NEXT · <other team> while that team's recap is still unseen.
- **Moonshot no longer reads as off after a fresh sign-in (F-130).** `config/app` and
  `config/gameRules` are readable only when signed in, and the startup fetch could run before
  the session was restored: both fell back to defaults for the rest of the session, so the
  Moonshot counter, the recap's Moonshot card and the version gate were silent until the next
  cold start. The app now fetches the config again once sign-in is known. This is why the
  owner's United States Moonshot was missing from the old recap.
- **Build scripts refuse to build without the config** (`scripts/release/build-uc-aab.sh`,
  `build-uc-apk-amazon.sh`, `build-uc-ios.sh`): no `EXPO_PUBLIC_FIREBASE_API_KEY` in the
  environment or `.env` stops the build before prebuild, and a finished bundle without a Firebase
  web API key fails the build after it.

## How 2.7.0's crash was found and proven

Reproduced on the Android 37.1 emulator by installing vc74 **through the Play Store** (a sideloaded
Play-signed APK exits earlier at Play's own integrity check, which is not the bug): logcat shows
`FirebaseError: auth/invalid-api-key` from `initializeAuth` at module load, reported as a fatal
JavaScript exception. Offline confirmation: the vc73 bundle contains one Firebase web API key
string, the 2.7.0 Play, Amazon and iOS bundles contain none. The throwaway vc75 cut launched to
the Welcome screen on the same emulator.

## Platform notes
- **Google Play**: versionCode 76 to production and every testing track, replacing 74.
- **Amazon Appstore**: versionCode 76 replaces the withdrawn 74; title unchanged.
- **iOS**: build 60 on the 2.7.1 version; build 58 removed from review, never released; 59 unused.
- **`config/app.minVersion` is untouched** (2.3.2). 2.7.0 cannot reach the config read, so a
  forced-update gate would not help it; players must take the store update.
