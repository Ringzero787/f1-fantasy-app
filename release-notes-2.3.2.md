# Undercut 2.3.2 (versionCode 57, iOS build 40) — 2026-09-19 — league reliability

## Play Console "What's new" (short)

League fixes.
- League member counts are now kept by our servers, so a league can no longer look full when it is not.
- Team names are checked for availability more reliably when you create or rename a team.
- Adding player slots to a league is now confirmed against your store purchase.

## Longer notes

**Leagues.** The app no longer keeps the member count itself when you join, leave, approve or remove a player. The server recounts approved members whenever membership changes, and once a day as a safety net. Older versions of the app keep working; the server corrects anything they write.

**Team names.** The "is this name taken" check now runs on the server instead of as a broad query from your device.

**League expansion.** Extra player slots are granted by the server from a validated store purchase. Google Play purchase validation now uses the correct package name.

**Behind the scenes.** First of two steps (F-059). Once this version is the minimum supported one, the league rules tighten so that only the server and the league owner can change a league's count and size.
