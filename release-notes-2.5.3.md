# Undercut 2.5.3 — release notes

Android versionCode 72 · Amazon versionCode 72 · iOS build 56

The first build to reach players since 2.5.1. 2.5.2 was built and tagged on 2026-10-09 and then
held by the owner as too small to ship, so everything in it (`release-notes-2.5.2.md`) arrives
here for the first time, together with the round report and the fixes that followed.

## Store copy

**Two versions.** One line is an iPhone fix, so the App Store text has it and the Google Play and
Amazon text does not: neither store wants another platform named in its listing.

German and Dutch keep the informal register the rest of the listing uses.

---

### English — App Store (416 / 500)

New: the Round Report. After each race, see how your league did on one screen: the podium, the biggest climb and drop, the best value per dollar, and every Moonshot that landed or missed. Open it from the League tab, or straight after your weekend recap.

Pit Wall now says who to ace. The driver sheet scrolls on iPhone again. Sign-in buttons are tidied up, and every screen reads properly at the largest text size.

### English — Google Play and Amazon (374 / 500)

New: the Round Report. After each race, see how your league did on one screen: the podium, the biggest climb and drop, the best value per dollar, and every Moonshot that landed or missed. Open it from the League tab, or straight after your weekend recap.

Pit Wall now says who to ace. Sign-in buttons are tidied up, and every screen reads properly at the largest text size.

### Deutsch — App Store (492 / 500)

Neu: der Rundenbericht. Nach jedem Rennen siehst du, wie deine Liga abgeschnitten hat: das Podium, größter Auf- und Abstieg, die meisten Punkte pro Dollar und jeder Moonshot, der gesessen hat oder danebenging. Du öffnest ihn im Liga-Tab oder direkt nach deinem Wochenend-Rückblick.

Pit Wall sagt jetzt, wer dein Ass sein sollte. Das Fahrerblatt lässt sich auf dem iPhone wieder scrollen. Die Anmelde-Buttons sind aufgeräumt, und jeder Bildschirm ist auch in der größten Textgröße gut lesbar.

### Deutsch — Google Play und Amazon (433 / 500)

Neu: der Rundenbericht. Nach jedem Rennen siehst du, wie deine Liga abgeschnitten hat: das Podium, größter Auf- und Abstieg, die meisten Punkte pro Dollar und jeder Moonshot, der gesessen hat oder danebenging. Du öffnest ihn im Liga-Tab oder direkt nach deinem Wochenend-Rückblick.

Pit Wall sagt jetzt, wer dein Ass sein sollte. Die Anmelde-Buttons sind aufgeräumt, und jeder Bildschirm ist auch in der größten Textgröße gut lesbar.

### Nederlands — App Store (448 / 500)

Nieuw: het rondeverslag. Na elke race zie je op één scherm hoe je competitie het deed: het podium, de grootste stijger en daler, de meeste punten per dollar en elke Moonshot die raak was of miste. Je opent het in het tabblad Competitie, of direct na je weekendoverzicht.

Pit Wall zegt nu wie je ace moet zijn. Het coureurblad scrolt weer op de iPhone. De inlogknoppen zijn opgeruimd, en elk scherm is ook in de grootste tekstgrootte goed leesbaar.

### Nederlands — Google Play en Amazon (406 / 500)

Nieuw: het rondeverslag. Na elke race zie je op één scherm hoe je competitie het deed: het podium, de grootste stijger en daler, de meeste punten per dollar en elke Moonshot die raak was of miste. Je opent het in het tabblad Competitie, of direct na je weekendoverzicht.

Pit Wall zegt nu wie je ace moet zijn. De inlogknoppen zijn opgeruimd, en elk scherm is ook in de grootste tekstgrootte goed leesbaar.

---

## What actually changed

**F-120 — the league round report (#213, #214).** How everyone in the league did in one race:
your place, the podium, every Moonshot settled on the race with the call of the round set apart,
then biggest climb and drop against each manager's own previous round, top and low score, and best
and least value (race points per $100 of the roster fielded). It opens from a row on the League
tab and as the next step after the weekend recap. The value pair needs the server to have recorded
roster values: that is deployed (OP-166) and past rounds are filled in (OP-167), for full lineups
only.

**F-119 — carried over from 2.5.2 (#205).** The driver sheet scrolls on iOS, and Pit Wall says who
to ace on the Team screen and in the driver sheet (pass holders).

**F-108 follow-ups (#207 to #212).**
- The Moonshot sheet keeps CLOSE on screen and the driver's name full size on iPhone.
- At the largest display size: the team name wraps, Moonshot choice cards keep their words whole,
  the sign-in wordmark stays on one line, the season total is no longer squeezed, and the League
  feed no longer clips its first lines.
- The team name is saved once when return is pressed, not twice.
- Sign-in buttons use each provider's own artwork and wording: Google's current G and Google Sans,
  Apple's system button on iOS, Amazon's own button image.
- Button order, as the owner set it while testing (#218): Google, Apple, Amazon on Google Play;
  Apple, Google on iOS; Amazon, Google, Apple on Amazon. Only the Amazon build changed.
- The weekend recap's button to the round report reads LEAGUE SCORES (#219).

### Native changes in this build
- A sixth embedded font, Google Sans Medium (a Latin subset), for the Continue with Google label.
  The release scripts fail a build without it.
- New bundled images for the Google and Amazon sign-in buttons.
- On iOS the Apple sign-in button is now the system control from `expo-apple-authentication`.

### Not proven by this release run
- A real sign-in with Apple or Amazon after the button changes, or with any provider on iOS. The
  owner signed in on the Play build on the Android emulator; the handlers are untouched.
- The weekend recap's new second step on a live account (it appears only when a recap is due).
- Dark theme and a screen reader on the round report.

### Known
- **The round report is in English in every language.** Its labels (ROUND REPORT, CALL OF THE
  ROUND, BIGGEST CLIMB and the rest) are not in the i18n catalogs yet, so a player using the app in
  another language sees them in English, and the localized notes name the feature in words the
  screen does not show. Localizing it is a follow-up.
- The Moonshot sheet fix on iPhone (CLOSE clipped, the driver's name tiny on first open) is in the
  build and the changelog but not in the short store copy.

## Platform notes
- **Google Play**: versionCode 72. 70 (2.5.1) is the last one uploaded; 71 (2.5.2) was never
  uploaded.
- **Amazon Appstore**: versionCode 72, title stays "Undercut: Fantasy Motorsport" in both title
  fields (`docs/store/amazon-listing.md`).
- **iOS**: build 56. Builds 53 (2.5.2), 54 (the first 2.5.3 run, before the dependency patches)
  and 55 (before the owner's two notes from testing) are uploaded to App Store Connect and
  attached to nothing; **56 is the one to submit**.
- **`config/app.minVersion` is untouched.** Nothing here needs a forced update.
