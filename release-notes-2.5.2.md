# Undercut 2.5.2 — release notes

Android versionCode 71 · Amazon versionCode 71 · iOS build 53

A small build on top of 2.5.1 (`release-notes-2.5.1.md`), carrying the two things the owner
reported from the field on 2026-10-09: the driver sheet did not scroll on iPhone, and the app never
said who to ace.

## Store copy

**Two versions.** The scroll fix is an iPhone fix, so the App Store gets both paragraphs. Android
and Fire OS scrolled before, and neither store wants another platform named in its listing, so
**Google Play and Amazon get the second paragraph only** (the Pit Wall one).

German and Dutch keep the informal register the rest of the listing uses.

---

### English (376 / 500; Play and Amazon paragraph alone 195)

The driver sheet scrolls on iPhone again. It had grown taller than the screen and a swipe did
nothing, so the stats, the contract and the Ace and Remove buttons were out of reach.

Pit Wall now says who to ace. With a Pit Wall Pass, the Team screen and every driver's sheet tell
you whether to set the ace, move it or keep it, from the same projections the Pit Wall site uses.

### Deutsch

Das Fahrerblatt lässt sich auf dem iPhone wieder scrollen. Es war höher als der Bildschirm
geworden, und ein Wisch tat nichts – Statistik, Vertrag und die Tasten für Ass und Entfernen
waren nicht erreichbar.

Pit Wall sagt jetzt, wer dein Ass sein sollte. Mit einem Pit Wall Pass zeigen dir der Team-Bildschirm
und jedes Fahrerblatt, ob du das Ass setzen, verschieben oder behalten solltest – mit denselben
Prognosen wie auf der Pit-Wall-Seite.

### Nederlands

Het coureurblad scrolt weer op de iPhone. Het was hoger geworden dan het scherm en vegen deed
niets, waardoor de statistieken, het contract en de knoppen voor Ace en Verwijderen onbereikbaar
waren.

Pit Wall zegt nu wie je ace moet zijn. Met een Pit Wall Pass vertellen het teamscherm en elk
coureurblad je of je de ace moet zetten, verplaatsen of houden – met dezelfde prognoses als op de
Pit Wall-site.

---

## What actually changed

**F-119 — the driver sheet scrolls on iOS.** Reported with a screenshot as *"the data rolls off the
screen and it's not scrollable"*. Since F-088 put the Pit Wall block in the sheet it is taller than
the screen, and on iOS a swipe inside it left the screen pixel-identical. The scrim was a
`Pressable` wrapped around a second `Pressable` wrapped around the `ScrollView`; it is now a sibling
behind the sheet. Android scrolled before, which is why the emulator never showed it. The Moonshot
sheet and the League race selector were built the same way and get the same change.

**F-119 — Pit Wall says who to ace.** The app showed each driver's projection and left the
comparison to the player; the portal's Briefing has made that call since F-097. The Team screen now
carries a PIT WALL line under the ace status, and the driver sheet opens its Pit Wall block with an
ACE CALL. Three answers: set it, move it, keep it. An ace that has risen over the price cap is told
to move whatever it projects, because scoring strips its multiplier. Pass holders only, the owner's
own team only, nothing once the ace is locked, and nothing while the projections are still last
round's.

**F-117 / F-118** merged since 2.5.1 and have no app code in this build: the Firestore rules tests
run in CI, and a team created after the lock sweep is still locked for that race (server side,
already deployed).

### Checked on the iOS simulator before the build
Release build of the merged code, demo data, iPhone 17 Pro, driven with Maestro:
- Driver sheet: scrolls to the Ace and Remove buttons; shows the ACE CALL.
- Moonshot sheet: opens from the driver sheet, steps through, scrolls once it is taller than the
  screen, closes on a backdrop tap.
- League race selector: opens, picking an option changes the standings, closes on a backdrop tap.
  The demo league has three options, so there was nothing to scroll there.

Not checked: VoiceOver and TalkBack on the restructured sheets.

### Seen and not fixed
Two cosmetic faults in the Moonshot sheet on iPhone, both present in 2.5.1 as well (confirmed by
building the 2.5.1 version of the file): on a long race name the header row runs wide and CLOSE is
clipped at the right edge, and the driver's name renders very small the first time the sheet opens
(it is the right size from the next step on).

## Platform notes
- **Google Play**: versionCode 71, supersedes 70 (2.5.1).
- **Amazon Appstore**: versionCode 71, title stays "Undercut: Fantasy Motorsport" in both title
  fields (`docs/store/amazon-listing.md`).
- **iOS**: build 53, signed with the same "Undercut AppStore Distribution" profile as build 52.
- **`config/app.minVersion` is untouched.** Nothing here needs a forced update.
