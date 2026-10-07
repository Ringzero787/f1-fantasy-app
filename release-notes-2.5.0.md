# Undercut 2.5.0 — release notes

Android versionCode 69 · Amazon versionCode 69 · iOS build 51

The Moonshot build. Everything since 2.4.3 (`release-notes-2.4.3.md`), on all three stores: the
comeback mechanic that opened on the server on 2026-10-07, the app surface for it, the Archivo
display type, the metadata-sync fix, the lock the clients show now matching the one the server
enforces, and the security review that was run before this build was cut.

## Store copy

**The same copy on all three stores.** One mechanic headlines; the rest is one line each.

German and Dutch keep the informal register the rest of the listing uses.

---

### English (491 / 500)

Moonshot is here. Behind in your league? From round 13 you can back one driver to do something
big — win, podium, points, beat a rival — and put some of your team's points or budget on it.
Call it right and the reward lands on your season total; miss and the stake is gone. You get a
handful of calls a season, so pick the moment.

Also: a bolder display typeface, a lineup lock that matches the server's, and team details that
are no longer overwritten by an older copy from another device.

### Deutsch

Moonshot ist da. Liegst du in deiner Liga zurück? Ab Runde 13 kannst du auf einen Fahrer setzen,
dass ihm etwas Großes gelingt – Sieg, Podium, Punkte, einen Rivalen schlagen – und dafür Punkte
oder Budget deines Teams einsetzen. Liegst du richtig, landet die Belohnung auf deiner
Saisonwertung; liegst du daneben, ist der Einsatz weg. Du hast nur wenige Calls pro Saison, also
wähle den Moment.

Außerdem: eine kräftigere Display-Schrift, die Aufstellungssperre in der App entspricht jetzt der
des Servers, und deine Teamdaten werden nicht mehr von einer älteren Kopie überschrieben.

### Nederlands

Moonshot is er. Sta je achter in je league? Vanaf ronde 13 kun je één coureur aanwijzen voor iets
groots – winst, podium, punten, een rivaal verslaan – en daar punten of budget van je team op
inzetten. Zit je goed, dan komt de beloning bij je seizoenstotaal; zit je mis, dan ben je de inzet
kwijt. Je hebt maar een paar calls per seizoen, dus kies je moment.

Verder: een stevigere displayletter, de opstellingsvergrendeling in de app is nu dezelfde als die
van de server, en je teamgegevens worden niet meer overschreven door een oudere kopie van een
ander apparaat.

---

## What actually changed

**F-106–F-111 — Moonshot.** A comeback mechanic for teams behind in their league. From the
unlock round (13), a team declares one call on a driver for the next race — WIN, PODIUM, POINTS,
BEAT a rival, or a FINISH position — staking POINTS from its ranked season total or CASH from its
budget. The multiplier is priced on the server from the weekly model (`moonshotModels/{race}`,
carried over from the previous week when none is supplied), less a margin, rounded, floored and
capped. Settlement runs with the race's scoring: a hit adds the reward to the team's season total
and the league feed; a miss costs the stake. Tokens per season and calls per race are capped. The
rules the owner chose on 2026-10-07: all drivers race — if a substitute drives, the call follows
the car; DNS and DNF lose; a cancelled race voids. The server side has been live since OP-146
(2026-10-07); this build is the first app that can make a call: the 🚀 row in the tile sheet, the
call flow, the team card, the standings column, the league feed, the race-day card, and a
one-time walkthrough. Live positions on race day stay off until the timing arrangement is
confirmed (ADR-001 note); the card shows PENDING and settles from the official result.

**F-112 — security review before this build.** Four audits over the Moonshot server, this app
build, the portal, and the rules. The app changes: the Moonshot menu is coerced like every other
server answer so a partial response cannot throw in a render; the walkthrough flag no longer
creates a ghost `users` document; one confirm in flight at a time; a persisted demo session is
dropped on a store build. Server and rules changes went out with PR #191's deploy ops
(settlement needs a classification; confirm reads the token document in its transaction; league
content is for approved members; team and notification lists are scoped). **`config/app.minVersion`
is now 2.3.2** — builds before that ran a team-name query the scoped rules refuse, and they see the
update screen instead of a failed rename.

**F-099 — Archivo wide display type in the app.** The Grid UI moves from Unbounded to the
Archivo face the portal adopted in F-097, same three weights, no layout change, so app and portal
read as one product.

**F-101 — the metadata sync pushes only the fields this device changed.** The periodic sync
pushed every local team's name, ace, league and avatar with a fresh timestamp whether or not this
device had changed anything — so a rename from Pit Wall or a second device could be written back
over by an older copy.

**F-103 — the lineup lock the clients show is the one the server enforces.** On a normal weekend
the app said lineups lock at FP3; the server locks them at qualifying, three and a half hours
later. The app's lock time is now the server's, so the badge and the refused write agree.

**F-100 / F-102 / F-104 / F-105** are portal and server changes with no app code in this build:
Pit Wall renames the team and the manager; the portal says when the ace freezes on a sprint
weekend; a team's `leagueId` must be a usable document id; creating a league cannot hand yourself
the paid features.

### Why the app build matters
Moonshot is open on the server and in Pit Wall already; installed 2.4.3 builds show nothing of
it and cannot make a call. And the F-112 rules go live with this release's ops — 2.3.1 and older
hit the update gate the moment `minVersion` is written, so the build they update to needs to be
in the stores.

## Platform notes
- **Google Play**: versionCode 69. vc68 (2.4.3) is in production; 69 supersedes it.
- **Amazon Appstore**: versionCode 69, title stays "Undercut: Fantasy Motorsport" in both title
  fields (the 2.4.1 rejection — `docs/store/amazon-listing.md`).
- **iOS**: build 51. The last build uploaded was 50 at 2.4.3.
