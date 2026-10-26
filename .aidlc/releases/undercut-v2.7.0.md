# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: the market stays open while your lineup is locked, your Moonshot is on the weekend recap, the Moonshot counter counts at lock, and Pit Wall's ace call leads the driver sheet. Server side, results now arrive on time because the timing feed is read with the paid key (no build needed for that).

## Added

- **Market while locked.** MARKET on the team row opens the picker as a read-only market through the race weekend: prices, points and projections, nothing to tap. The save bar reads LOCKED · AUTO-FILL ON.
- **Moonshot in the weekend recap.** A card between the weekend's points and the scorers shows your call, the driver's finish and the points, and one line adds roster and Moonshot into the weekend total. A cash stake is named as cash; a void says the token came back.
- **Race-day running score, switched off.** The code for a live LIVE +N on every tile and a LIVE · SO FAR stat during a race is in this build, but nothing shows until the live-timing switch is turned on after the timing provider's written confirmation.

## Changed

- **Moonshot counter.** A token counts as spent when its call locks, not when you place it, since an open call can still be cancelled for a full refund: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, then ONE USED THIS WEEKEND.
- **Ace call first.** Pit Wall's ACE CALL is the first block in the driver sheet, under the driver's name and team; when the call is to ace this driver, MAKE ACE · 2× POINTS sits right there and the bottom pill is gone.
