# Undercut 2.9.0 — release notes

Android versionCode 80 · Amazon versionCode 80 · iOS build 64

Cut 2026-11-24 from `97bfcae` (master) for the end of the 2026 season and the 2027 reset. The owner is
ramping up advertising, so this is the build new players will install over the off-season.

The build carries the app halves of:
- F-157 (season from the server);
- F-167 (open-slot highlight);
- F-169 (contract picker);
- F-174 (notice banner);
- the iOS Xcode 27 build fixes (#311, #315).

Server changes since 2.8.0 are already live (see `CHANGELOG.md`).

## Store copy

### English (all stores)

Ready for next season. Contract lengths now follow the calendar: the picker offers only what fits the races left and shows how long a driver has been on your team in a row (six at most). Empty lineup slots stand out, so you see at a glance what is left to fill. The app follows the current season on its own, and a notice on the Team screen will tell you what is changing when the new season starts.

### Deutsch (alle Stores)

Bereit für die nächste Saison. Vertragslängen folgen jetzt dem Kalender: Die Auswahl bietet nur, was zu den verbleibenden Rennen passt, und zeigt, wie lange ein Fahrer schon am Stück in deinem Team ist (höchstens sechs). Freie Plätze im Team fallen sofort auf. Die App folgt der aktuellen Saison von selbst, und ein Hinweis im Team-Bildschirm erklärt dir zum Saisonstart, was sich ändert.

### Nederlands (alle stores)

Klaar voor het volgende seizoen. Contractlengtes volgen nu de kalender: de keuze biedt alleen wat past bij de resterende races en laat zien hoe lang een coureur al achter elkaar in je team zit (hooguit zes). Lege plekken in je line-up vallen meteen op. De app volgt het huidige seizoen vanzelf, en een melding op het Team-scherm vertelt je bij de start van het nieuwe seizoen wat er verandert.

## What actually changed since 2.8.0

- **Notice banner (F-174, #316).** The banner reads `config/app.notice` (`{id, title, body, tone?, from?, until?, minVersion?, maxVersion?, url?}`).
  - Anything malformed shows no banner, so it fails closed.
  - It shows only inside its time window and its version bounds.
  - Dismissal is per notice id on the device.
  - It is off until a uc-script op sets the notice. For the reset, `from` is the rollover time.
- **Season from the server (F-157, #308).** The app reads `config/app.currentSeason` instead of the device year, so this build follows the rollover into 2027.
- **Contract picker (F-169, #303).** The picker offers lengths 1 to the maximum allowed, which is the smallest of three caps: 6 races, the races left this season, and 6 minus the driver's current run. When the maximum is under 6, the picker says why, for example "2 RACES LEFT THIS SEASON" or "ON YOUR TEAM 4 RACES IN A ROW · 2 MORE AT MOST". A driver at a full run is a blocked row. The Rules Guide says 1–6, the season cap and six in a row.
- **Open-slot highlight (F-167, #301).** Open slots get an accent wash, a 1.5 px dashed accent border and the "+" in an accent ring.
- **iOS build fixes (#311, #315).** Build-only, with nothing players see.

## Verified before handover

- **Firebase key:** `AIza` is present in the AAB, the Amazon APK and the IPA bundles.
- **Android signer:** the AAB and the Amazon APK both carry SHA-256 `70ec4c19…cfe7`.
- **Versions:** both Android files are 2.9.0 / versionCode 80. The IPA is 2.9.0 / build 64, `com.undercut.app`, signed.
- **Launch test:** the Amazon APK was installed over a signed-in 2.8.0 on the emulator. It launched signed in on live data (Las Vegas recap, Lusail countdown), with no crash entries.
- **iOS:** the build was archived from a cleared DerivedData and uploaded to App Store Connect by the release run.
- **G13 sign-off:** it held four times, for the same reason. The artifact list, signatures and reproducible-build hash are not in its evidence packet, because no artifact globs or cosign are configured for this unit and syft is missing. Every other gate passed. This is an evidence gap in the engine, not a failed check.
