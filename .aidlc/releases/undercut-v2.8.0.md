# uc-v2.8.0 — 2026-11-14

Undercut 2.8.0: Pit Wall plans the rest of your lineup from your first picks and calls your ace when you confirm, plus the fixes from the latest playtest: a driver you can afford is never blocked, any market driver opens its details, and team names lead.

## Added

- **Pit Wall strategies.** The first drivers you add tell Pit Wall how you are building: a top-priced driver reads STARS, only budget drivers read VALUE, anything else BALANCED. A PIT WALL STRATEGY strip on the drivers tab lets you switch, and the drivers in its plan for your open seats are marked PIT WALL PLAN, within your bank after the cheapest constructor.
- **Ace call when you confirm.** Saving a full lineup opens Pit Wall's ace call as soon as you are back on your team.

## Changed

- **Team names first.** Your team name leads in large type with the player's name small beneath it, on the Grid, in leagues and in the round report. The league Moonshot feed is one line: MOONSHOT +N POINTS · TEAM.
- **Car numbers** are larger, bold and in team colours on team and league tiles.
- **Pit Wall is gold.** Its pick band, ace call, analysis and Pass rows use gold instead of red; red now means a bad number, and warnings are orange.
- **A held roster says when it reopens.** After a race the header reads RESULTS PENDING, REOPENS IN … or REOPENING SOON instead of a countdown over locked rows, and your team is read again when you come back to it.

## Fixed

- **An affordable driver you could not buy.** 2.7.2 blocked any driver that left too little for the cheapest finish, so $18 in the bank would not buy a $5 driver. A driver you can afford can always be bought now; one that leaves too little is flagged TIGHT · LEAVES TOO LITTLE FOR THE REST.
- **Market details outside edit mode.** Locked or unavailable market rows open a read-only details sheet, and a long press opens it on any row.
- **"JR" as a surname.** Names with Jr., Sr. or a numeral show the real surname.
