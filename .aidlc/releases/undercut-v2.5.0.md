# uc-v2.5.0 — 2026-10-07

Moonshot racing predictions, team name editing, and live-timing improvements in Undercut 2.5.0.

## Added

- **Moonshot**: from round 13 a team behind in its league can make one call on a driver for the next race — win, podium, points, or beat a rival — staking some of its season points or roster budget. A hit lands the reward on your season total; a miss costs the stake. Available in the team and league views, with a first-run walkthrough.
- Live-timing data ingestion for race day, distributed across Firestore for real-time updates.
- Ability to rename your team and manager's display name from the Pit Wall portal; changes sync across all your devices.
- Archivo typeface in the app, matching the Pit Wall web portal.

## Changed

- Team metadata sync is now smarter: only your device's local changes upload to Firestore, preventing reversions from edits made elsewhere.
- Lineup lock displayed in the app now matches the server's enforced lock time.

## Fixed

- Security review hardening applied before the 2.5.0 release.
- League creation no longer grants paid features without proper licensing.
- Team league IDs now validate as usable Firestore document IDs.
- Metadata sync no longer overwrites newer server copies during periodic updates.
