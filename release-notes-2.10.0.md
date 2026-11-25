# Undercut 2.10.0 — release notes

Android versionCode 81 · Amazon versionCode 81 · iOS build 65

Cut 2026-11-25 from `1242a1c` (master) to be live for the Qatar weekend (Sunday 29 November).

The build carries the app halves of:
- F-175 Charter, slices 1–5. The Charter offer itself stays hidden in every build until the sale flip. Store testers on Android are the exception (slice 5).
- League slot packs (#323), which replace the retired +20 pack.
- F-176 one-call lineup save (#324).

Server changes since 2.9.0 are already live: OP-248 to OP-251.

## Store copy

### English (all stores)

Find a league to join: browse public leagues and ask to join with one tap. League owners now see join requests in one place and approve or decline each player. Saving your lineup is faster, in a single step. League owners can add 3 more player slots at a time.

### Deutsch (alle Stores)

Finde eine Liga: Durchsuche öffentliche Ligen und frage mit einem Tipp nach Aufnahme. Liga-Besitzer sehen Beitrittsanfragen jetzt an einem Ort und nehmen jeden Spieler an oder lehnen ab. Dein Team speichert schneller, in einem Schritt. Liga-Besitzer können jeweils 3 weitere Plätze hinzufügen.

### Nederlands (alle stores)

Vind een competitie: blader door openbare competities en vraag met één tik om mee te doen. Eigenaars zien verzoeken nu op één plek en keuren elke speler goed of af. Je line-up opslaan gaat sneller, in één stap. Eigenaars kunnen telkens 3 extra plekken toevoegen.

## Store actions that go with this build

- **Slot packs:**
  - **Play:** activate `league.slots3` and `league.slots3.charter` when this build goes to production.
  - **App Store:** submit both in-app purchases with this version. They need the review screenshot from this build: the "LEAGUE SIZE +3" row in the League Manager.
  - **Amazon:** add `league.slots3` (Consumable, $4.99) with this version.
  - Until a store prices a pack, its row does not show.
- **Charter:** do not submit `pitwall.charter.season` on the App Store with this build. Its offer is hidden there. On Play, activate it only for the slice 5 sandbox test, using license-tester accounts.

## What actually changed since 2.9.0

- **Public league search (F-175 slice 4).** "FIND A PUBLIC LEAGUE" in the League Manager and on the empty league page. It sorts chartered leagues first; there are none yet, so today it lists public leagues by size. Asking to join a league that needs approval leaves the player "WAITING ON {OWNER}", with CANCEL REQUEST.
- **Join requests (slices 3 and 4).** The owner gets a "REQUESTS TO JOIN" row and a sheet to approve or decline each player. Approval now goes through `charter-approveMember`.
- **Charter UI (slice 4):**
  - the square, the owner and member cards, Rank Up, the unlock sheet and the ceremony;
  - all of it shows only in a chartered league, and none exist;
  - the offer is hidden while `PITWALL_CONTENT_OPEN` is true or the sale flag is off, except to `testAccount` users on Android.
- **Slot packs (#323).** "LEAGUE SIZE +3" ($4.99, or $3.99 in a chartered league) once the store prices it. The +20 pack is no longer sold; credits already paid still apply.
- **One-call lineup save (F-176, #324).** `applyLineupSecure` replaces the per-driver calls.
