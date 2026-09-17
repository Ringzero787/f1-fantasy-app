# Undercut 2.2.3 (versionCode 54) — 2026-09-17

## Play Console "What's new" (short)

Faster team management and live standings.
- Buying, selling and swapping drivers or your constructor now updates instantly, with no loading screen while the transfer saves.
- League standings update live after every race, with no need to pull to refresh.
- Expired contracts now leave the seat open for you to fill. If it is still empty when the weekend locks, Undercut fills it with the best-value driver your bank can afford, not the cheapest one.
- Rules Guide updated to match.

## Longer notes

**Transfers feel instant.** Every roster edit used to make three round-trips to the server and briefly replace the whole My Team screen with a spinner. The server now hands back your updated team in the same call, the app paints the change immediately, and a constructor swap or sale rolls back cleanly if the server refuses it.

**Standings are live.** The league table opens from the last table you saw and then follows the server, so race results, new members and points changes appear without a refresh. The league list loads the same way.

**Auto-fill is fair now (server change, already live).** When a driver or constructor contract expires, the seat stays open and you get the usual reminders before the weekend locks. Anything still empty at the lock is filled with the combination of affordable cars with the best recent form, chosen to fill every seat first. Previously the game bought the cheapest driver on the grid the moment a contract ended, which left inactive teams with $700 or more sitting unused.

**Also in this build**
- Rules Guide: the Auto-Fill section describes the new behaviour.
