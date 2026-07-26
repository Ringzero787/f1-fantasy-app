# Track Limits 0.1.37 (versionCode 38)

## Fixed

- **Call-sign dialog could overwrite your real name with "Player".** The
  "Use \<name\>" fallback was built from a stale cached user object with no
  email, so it degraded to the literal "Player" — and confirming saved that
  over the name you'd already chosen, re-arming the prompt forever. The screen
  now takes uid/email from Firebase Auth directly and refuses to save any
  placeholder name. A Firestore rules guard (deployed 2026-07-26) also rejects
  placeholder display-name writes from older builds still in the wild.

## Changed

- Ben-pill tooltip now explains the new reward: every correct call pays $10
  even with nothing staked; staking amplifies. (The $10 win bonus itself is
  server-side in settlement, live since 2026-07-26 — no app update required.)

## Play Console blurb

> Fixed a bug where the call-sign prompt could keep coming back (and could
> reset your chosen name). New: every correct call now pays $10 — even if you
> didn't stake anything on it.
