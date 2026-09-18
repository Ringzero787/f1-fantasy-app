# uc-v2.3.0 — 2026-09-18

Undercut 2.3.0: Grid redesign, Android release automation, and profile photo uploads fixed.

## Added

- Android release automation (uc-android target) for store builds with signing.

## Changed

- **Grid redesign** across the app: new theme, fonts, and navigation routes.
- Profile screen rebuilt with Grid UI.
- League standings and League Manager screens redesigned.
- Sign-in and create-team flows restyled.
- Pick Team screen: driver and constructor picker replaces Market panel with budget and contract details.
- Standings movement and best-race player fields added.
- Team screen restyled with Grid theme.

## Fixed

- Profile photo uploads now work correctly by writing to the owner-scoped `avatars/{uid}/user/` path instead of `profile-images/`.
