# Undercut 2.4.3 — release notes

Android versionCode 68 · Amazon versionCode 68 · iOS build 50

One change, on all three stores: the Ace lock is now enforced by the server, and the app agrees
with it. Everything else is 2.4.1 (see `release-notes-2.4.1.md` — 2.4.2 was a renumber of it).

## Store copy

**The same copy on all three stores this time.** 2.4.1 needed a different list per store because
each build offered a different set of sign-ins; this change behaves identically everywhere, and
writing three variants of one sentence is how a listing drifts from the app.

German and Dutch keep the informal register the rest of the listing uses.

---

### English (339 / 500)

Your Ace now holds while a session it scores in is running. From the start of qualifying — or of
the sprint, on a sprint weekend — it is fixed, until qualifying has been scored. After that it is
yours to move again, right up to lights out.

And the app no longer offers you an Ace change it cannot save, so the button and the result agree.

### Deutsch

Dein Ass bleibt jetzt stehen, solange eine Session läuft, in der es punktet. Ab dem Start des
Qualifyings – oder des Sprints an einem Sprintwochenende – steht es fest, bis das Qualifying
gewertet ist. Danach kannst du es wieder ändern, bis zum Start des Rennens.

Und die App bietet dir keine Ass-Änderung mehr an, die sie nicht speichern kann.

### Nederlands

Je Ace ligt nu vast zolang er een sessie loopt waarin hij punten oplevert. Vanaf de start van de
kwalificatie – of van de sprint, in een sprintweekend – staat hij vast tot de kwalificatie
verwerkt is. Daarna kun je hem weer wijzigen, tot aan de start van de race.

En de app biedt je geen Ace-wijziging meer aan die hij niet kan opslaan.

---

## What actually changed

**F-095 and F-098 — the Ace lock holds on the server.** The Ace doubles a pick's points, and three
sessions score with it applied: qualifying, the sprint and the race. Each is scored minutes after
the session ends, reading whatever the Ace is at that moment — and until now the only thing
stopping someone moving it mid-session was client code. A player with the Firebase web SDK and
their own credentials could watch a session, point their Ace at whoever had won it, and have those
points doubled.

The lock is now a window stamped on the team by the server and enforced in the Firestore rules, so
it holds whatever the client does. It runs from the first session the Ace scores in to a 24-hour
ceiling, with one deliberate gap: once qualifying has been scored and before lights out, the Ace
moves freely. **That gap is the feature and it is unchanged** — choosing your Ace on the strength
of qualifying is the point of the Ace.

What players lose is the ability to move the Ace *during* qualifying or *during* the sprint, which
was never meant to be possible.

### Why the app build matters
The server side of this went live on 2026-10-04 (OP-115/116 for F-095, OP-119/120 for F-098).
Installed 2.4.2 builds know nothing about it: they offer an Ace change through qualifying and the
sprint, the write is refused, and `syncTeamToFirebase` only logs the refusal — so the Ace appears
to move and then quietly does not. This build is what stops that, and it wants to be out before
the next qualifying.

## Platform notes
- **Google Play**: versionCode 68. vc67 (2.4.2) is in production; 68 supersedes it.
- **Amazon Appstore**: rebuilt at 2.4.3 this time, because the client change is real — unlike
  2.4.2, which was a renumber Amazon did not need.
- **iOS**: build 50. The last build uploaded was 48 at 2.4.1; 49 was never built.
