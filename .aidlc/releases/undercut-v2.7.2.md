# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2: three Pick Team fixes from the Mexico picks — the picker holds back the cheapest finish so a driver can never leave you without a constructor, your picks save before the lineup is complete, and Pit Wall's pick is a highlighted row instead of a badge over the stats.

## Fixed

- **A driver that left no room for a constructor.** A driver counted as affordable when its price fit the cash left, with nothing held back for the seats still open, so four Pit Wall drivers on $65 left no constructor you could buy, and Pit Wall marked the very driver that caused it. A row is now affordable only if the cheapest finish for the open seats, the constructor included while none is picked, still fits after it; the budget line counts the constructor as a seat and the LEAVES badge says what the money is for.
- **Picks that could not be saved.** SAVE LINEUP waited for five drivers and a constructor, so four picks could not be kept without a constructor you could not afford. A changed lineup now saves as it is, the summary names the seats still open and that they auto-fill at lock, and leaving with unsaved picks (CANCEL, the back button or the iOS swipe) asks first.
- **The PIT WALL PICK badge over the stats.** The badge sat beside the team name and ran under the projection column. Pit Wall's pick is now the whole row, highlighted, with the label on its own line above the name; BEST VALUE and the pairing hints sit on a line below the team name.
