# Undercut 2.3.0 (versionCode 55, iOS build 38) — 2026-09-18 — the Grid redesign

## Play Console "What's new" (short)

A whole new look. Black, grey and one red.
- Your team is now a grid of six tiles: five drivers and your constructor, each with season points, last-race trend and contract races left at a glance.
- Pick Team replaces the Market: choose your whole lineup, see your budget update as you go, then confirm once with a summary of every sale, fee and purchase.
- League standings show who moved up or down after each race. Tap any player to see their team.
- New Profile with avatar, appearance (auto, dark, light) and display size.
- New sign-in and first-run screens.

## Longer notes

**Team.** The header shows the round, where it is, and how long until lineups lock. Tiles show the car number, season points, the trend against the race before, and one dot per race left on the contract; the last race turns red. Open seats are dashed tiles that take you straight to Pick Team. Tap ACE on a tile to double that pick's points for the weekend.

**Pick Team.** Drivers and constructors in one list each, sorted by points or price. Rows you cannot afford, drivers on cooldown and a full lineup dim out. Adding a pick asks for the contract length (1 to 6 races). Nothing is bought or sold until you press SAVE LINEUP, and the summary lists each sale with any early-termination fee, each purchase, and your bank afterwards.

**League.** Standings are monochrome with your own row in red, a SEASON / LAST RACE toggle, and the gap to the leader. Movement arrows appear from the next scored round. Without a league you see "Racing solo." with Create and Join. League settings, the invite code (email, text or copy) and leaving or deleting a league live in the new League Manager, reached from Profile. League creators can add player slots there.

**Profile.** A full screen instead of a sheet: name, team name, avatar (AI-generated, a photo, or your initials), league, appearance, display size, team reminders, race history by round, rules, privacy and account.

**Fixed.** Choosing a profile photo from your library now uploads correctly.

**Behind the scenes.** New type (Unbounded and JetBrains Mono, embedded in the app), real screen-to-screen navigation with native transitions, race scores fetched with two small reads instead of the full history, and critical dependency advisories patched across the app and its cloud functions.
