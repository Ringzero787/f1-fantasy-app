# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: fixes the crash at launch in 2.7.0, makes the weekend recap tell your weekend as it was scored, one recap per team, and keeps Moonshot on after a fresh sign-in.

## Fixed

- **Crash at launch in 2.7.0.** 2.7.0 was built without its Firebase web configuration and stopped on the splash screen on every platform. 2.7.1 is the same features built correctly, and the build scripts now refuse to produce a bundle without that configuration.
- **Moonshot off after signing in.** The app read its configuration once at startup, sometimes before the session was restored, and kept the defaults for the whole session: the Moonshot counter, the recap's Moonshot card and the next-round line stayed hidden until a cold start. The configuration is now read again once sign-in is known.

## Changed

- **Weekend recap from the record.** The recap now shows your points as the server scored them, pick by pick, with ACE ×2, TEAM and AUTO marked and picks that scored 0 on one line; FIELDED n OF 6 when slots were open; your place in the round with the gap to its winner, and your season rank with how it moved; your settled Moonshot with the weekend total; and the next round with its lock and your Moonshot on it. The card names the team, and a player with two teams gets one recap per team.
