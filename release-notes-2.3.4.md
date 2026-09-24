# Undercut 2.3.4 (versionCode 59, iOS build 42) — 2026-09-24 — per-race league leaderboards, R8

_2.3.3 (build 41, versionCode 58) is the version in review at Apple, Amazon and, after 2.3.2, Google. 2.3.4 adds the per-race league leaderboard and race wins (F-062) and an R8-optimised Android build. If 2.3.3 has not gone live on a store yet, submit 2.3.4 there instead; the store text below still covers the full Grid redesign._

## Google Play "What's new" (450 of 500 characters)

```
A whole new look. Black, grey and one red.
- Your team is a grid of six tiles. Tap one for stats, to make it your Ace, or to remove it.
- Pick Team replaces the Market: build your lineup, then confirm once with a summary of every sale, fee and purchase.
- League standings show who moved up or down. Tap a player to see their team.
- New icon, launch animation, Profile and sign-in.
- Weekly results: see each race's league leaderboard and race wins.
```

## Amazon Appstore and App Store "What's New" (full, 2246 characters)

```
A whole new look. Black, grey and one red.

TEAM
Your team is now a grid of six tiles: five drivers and your constructor. Each tile shows season points, the trend against the race before, and one dot per race left on the contract. Tap a tile for stats, to make it your Ace, or to remove it. Remove shows the sale price and any early-termination fee before you confirm. Picks priced at $200 or less can be your Ace, and the app tells you in red when you have not chosen one. The header shows the round, where it is, and how long until lineups lock.

PICK TEAM
Pick Team replaces the Market. Drivers and constructors sit in one list each, sorted by points or price, and your budget updates as you go. Adding a pick asks for the contract length, from 1 to 6 races. Nothing is bought or sold until you press Save Lineup, and the summary lists every sale, fee and purchase with your bank afterwards.

LEAGUE
Every race now has its own leaderboard: pick a race from the standings selector to see who scored what that weekend, and race wins show on the season table. Standings show your own row in red, a Season and Last Race toggle, and the gap to the leader. Arrows show who moved up or down after each race. Tap any player to see their team. League settings, the invite code, and leaving or deleting a league live in the new League Manager, reached from Profile. League creators can add player slots there.

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
- Smaller, faster Android build.
```

## What changed since 2.3.3

**Per-race leaderboards (F-062).** The SEASON toggle on the League screen is now a selector: season, last race, or any race the server recorded a leaderboard for. The season table shows race wins on the team line. Round 16 carries a partial leaderboard from race-day points; exact ones start with round 17.

**Android build.** R8 minification and resource shrinking are on: a smaller install and a leaner Java side. Verified on the emulator with a real account.

**Behind the scenes.** Race snapshots per team per weekend (F-029) are written by the server from round 17 on.
