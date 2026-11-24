# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: contract lengths that follow the calendar, open-slot highlight, season from the server, and a notice banner for the 2027 reset

## Added

- Server-driven notice banner at the top of the Team panel (F-174). Its text comes from `config/app.notice`, can be changed or withdrawn without a build, and is dismissible per notice on the device. It is off until an op sets it.
- Open lineup slots get a soft accent wash, a dashed border and a ringed plus (F-167).

## Changed

- The app reads the current season from the server instead of the device year (F-157), so the 2027 season works in this build once the rollover runs.
- The contract picker offers only lengths that fit: at most 6 races, the races left this season, and six races in a row on the team. It says why when fewer are offered, and the Rules Guide explains the caps (F-169, app half; the server half is already live).

## Fixed

- iOS builds on Xcode 27 from a clean cache (pods raised to iOS 15.1, an iOS 16 call guarded, fmt built as C++17, React Native prebuilts). This is build-only, with no change players see.

## Already live without this build

The server changes since 2.8.0 need no store build and are not part of this binary:
- post-race corrections and expiry prices (F-168);
- auto-fill counting as a transfer, and the stale-penalty refund (F-170);
- season-aware ingestion, scope and rollover (F-149..F-151, F-155 server side);
- held-result retry (F-152);
- test accounts (F-164);
- the dependency pass (F-148).
