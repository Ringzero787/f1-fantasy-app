# Undercut 2.3.3 (versionCode 58, iOS build 41) — 2026-09-19 — the Grid redesign, first public release

_2.3.0, 2.3.1 and 2.3.2 were built but never submitted to the stores. 2.3.3 is the first public Grid release, so the store text covers the redesign. It adds the new U-mark icon with its launch animation (F-067) and the Team grid width fix. The detailed redesign write-up is in `release-notes-2.3.1.md`; the league changes are in `release-notes-2.3.2.md`._

## Google Play "What's new" (450 of 500 characters)

```
A whole new look. Black, grey and one red.
- Your team is a grid of six tiles. Tap one for stats, to make it your Ace, or to remove it.
- Pick Team replaces the Market: build your lineup, then confirm once with a summary of every sale, fee and purchase.
- League standings show who moved up or down. Tap a player to see their team.
- New icon, launch animation, Profile and sign-in.
- League member counts and team-name checks now run on our servers.
```

## Amazon Appstore and App Store "What's New" (full, 2056 characters; App Store limit is 4000)

```
A whole new look. Black, grey and one red.

TEAM
Your team is now a grid of six tiles: five drivers and your constructor. Each tile shows season points, the trend against the race before, and one dot per race left on the contract. Tap a tile for stats, to make it your Ace, or to remove it. Remove shows the sale price and any early-termination fee before you confirm. Picks priced at $200 or less can be your Ace, and the app tells you in red when you have not chosen one. The header shows the round, where it is, and how long until lineups lock.

PICK TEAM
Pick Team replaces the Market. Drivers and constructors sit in one list each, sorted by points or price, and your budget updates as you go. Adding a pick asks for the contract length, from 1 to 6 races. Nothing is bought or sold until you press Save Lineup, and the summary lists every sale, fee and purchase with your bank afterwards.

LEAGUE
Standings show your own row in red, a Season and Last Race toggle, and the gap to the leader. Arrows show who moved up or down after each race. Tap any player to see their team. League settings, the invite code, and leaving or deleting a league live in the new League Manager, reached from Profile. League creators can add player slots there.

PROFILE
A full screen instead of a sheet: name, team name, avatar, appearance (auto, dark or light), display size, team reminders, race history by round, rules, privacy and account. Avatars can be AI-generated, a photo, or your initials.

ALSO NEW
- New app icon, and a launch animation that unrolls the U into UNDERCUT.
- New sign-in and first-run screens.
- Real screen-to-screen navigation with smooth native transitions.
- League member counts are now kept by our servers, so a league can no longer look full when it is not.
- Team names are checked for availability more reliably.
- Extra league player slots are confirmed against your store purchase.

FIXED
- The Team grid no longer collapses to a single column on some screen widths.
- Choosing a profile photo from your library now uploads correctly.
```

## What changed since 2.3.2

**New icon.** A white U with a red cut on the app's near-black ground replaces the old car logo on the launcher, splash and store listings.

**Launch animation.** On a cold start the splash's U unrolls into the UNDERCUT wordmark and fades into the app, in under two seconds. Phones with reduced motion turned on get a still wordmark.

**Fixed.** At some screen widths the six Team tiles wrapped into a single column. The tile width is now rounded down so two always fit.
