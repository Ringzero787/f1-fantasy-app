# Undercut 2.5.1 — release notes

Android versionCode 70 · Amazon versionCode 70 · iOS build 52

A small build on top of 2.5.0 (`release-notes-2.5.0.md`), carrying two fixes the owner reported
from the field: a league invite now opens the app instead of a browser, and the budget on the
driver-pick screen can be read again.

## Store copy

**The same copy on all three stores.** Two fixes, one line each.

German and Dutch keep the informal register the rest of the listing uses.

---

### English (425 / 500)

Tap a league invite and Undercut opens. The link used to end up in a browser — and before that it
went nowhere at all, because the address it pointed to did not exist. Both are fixed.

The budget on the driver-pick screen is readable again, too. It was dim grey on a dark panel and
all but invisible; it is now high-contrast, and it changes colour when you are running low. Not
red — a budget you still have is not a mistake.

### Deutsch

Tippe auf eine Liga-Einladung, und Undercut öffnet sich. Vorher landete der Link im Browser – und
davor nirgendwo, weil die Adresse, auf die er zeigte, gar nicht existierte. Beides ist behoben.

Auch das Budget in der Fahrerauswahl ist wieder lesbar. Es war blasses Grau auf dunklem Feld und
kaum zu erkennen; jetzt ist es kontrastreich und wechselt die Farbe, wenn es knapp wird. Nicht rot
– ein Budget, das du noch hast, ist kein Fehler.

### Nederlands

Tik op een competitie-uitnodiging en Undercut gaat open. Eerst kwam de link in een browser terecht
– en daarvoor nergens, omdat het adres waar hij naar wees niet bestond. Beide zijn opgelost.

Ook het budget in het rijderskeuzescherm is weer leesbaar. Het was flets grijs op een donker vlak
en nauwelijks te zien; nu heeft het veel contrast en verandert het van kleur als je bijna niets
meer over hebt. Niet rood – een budget dat je nog hebt is geen fout.

---

## What actually changed

**F-113 — an invite link opens the app.** Two halves. The first was not deep-link plumbing at all:
`undercut.humannpc.com`, the host every invite email has pointed at, **did not resolve**. Invites
had been sending people to a name that did not exist, so even `join.html`'s fallback redirect never
ran. The subdomain now exists and Firebase Hosting serves it (OP-157), which fixes the invite link,
`join.html`'s redirect for already-installed builds, and the privacy URL filed with the stores.

The second half is this build: iOS `associatedDomains` and an Android `autoVerify` intent filter
for `undercut.humannpc.com`, claiming exactly `/join` and `/join.html` — the two paths the app
understands — so the link opens Undercut directly instead of a browser that then has to bounce it
through a custom scheme any app can claim. The association files are live and verified: Google's
Digital Asset Links API returns four verified statements, and Apple's CDN has cached the file.
Android verifies against the **Play** signing certificate, not the upload key, which is the part
that would otherwise have failed silently for everyone who installed from Play.

**F-113 — the budget on the driver-pick screen.** Reported as *"on black the text is un visable"*.
It was a plain label in `text.muted`, which measures exactly 4.50:1 on the dark surface — the AA
floor for normal text, and the wrong bar for a 10px label with wide letterspacing. It is now a chip
with the value at 15.6:1, and a caution tone for a low budget that is deliberately not red, because
red is this UI's error accent and a budget you still have is not an error. The light theme's warning
colour was itself below AA on that chip and was darkened. The contrast of every pair is now
measured by a test, in both themes.

**F-114 / F-115** are Pit Wall portal changes with no app code in this build: the league your team
is in, on Lineup Lab and in the context bar; and tables that read larger on a wide screen.

### Why the app build matters
The host and the association files are live, but `associatedDomains` and `intentFilters` are native
config — an installed 2.5.0 cannot verify a link no matter what the server serves. Until a player
updates, their invites take the `join.html` custom-scheme fallback, which works and is not
hijack-proof. 2.5.1 is what makes the invite a verified App Link.

## Platform notes
- **Google Play**: versionCode 70. vc69 (2.5.0) is in production; 70 supersedes it.
- **Amazon Appstore**: versionCode 70, title stays "Undercut: Fantasy Motorsport" in both title
  fields (the 2.4.1 rejection — `docs/store/amazon-listing.md`). Fire OS has no Play Services and
  nothing verifies App Links there, so Amazon installs keep the `join.html` fallback.
- **iOS**: build 52. The last build uploaded was 51 at 2.5.0, now READY_FOR_SALE. This is the
  first archive signed with the regenerated "Undercut AppStore Distribution" profile, which had to
  carry the Associated Domains capability — without it the archive fails to sign.
- **`config/app.minVersion` is untouched.** It stays wherever 2.5.0 left it; nothing here needs a
  forced update.
