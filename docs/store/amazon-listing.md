# Amazon Appstore listing — Undercut

**The listing copy belongs here, not only in the developer portal.** On 2026-10-04 Amazon
rejected 2.4.1 for a title with "repetitive words or phrases" and nothing in this repo could say
what the title was — the portal was the only copy. That is the reason this file exists.

Package `com.undercut.app` · Developer Name **Human NPC Studio** · assets in
`pics/amazon_appstore/`.

## Title

```
Undercut: Fantasy Motorsport
```

28 characters. Use it for **both** title fields — App Title and Display Title — so the two
cannot drift apart.

No word repeats, no ALL CAPS, no emoji, no price, no ASIN, and nothing from the trademark
watchlist (F1, Formula 1, FIA, Grand Prix — see CLAUDE.md: fine in descriptive copy, never in a
name). The developer name is deliberately absent: Amazon shows it separately, and repeating it
in the title is one of the common ways this check fires.

## Short description

```
Build a fantasy motorsport team, set your lineup before qualifying, and run a private league
with friends across the season.
```

## Long description

```
Undercut is a fantasy motorsport game played over a full season.

Pick five drivers and a constructor inside a fixed budget, then manage that team weekend to
weekend. Prices move with form, contracts run out, and the bank you have on Sunday is the one
your choices left you.

Your lineup locks when the weekend's first scoring session begins. One pick can be named your
Ace for double points, and the Ace stays yours to move after qualifying, right up to the start
of the race.

Create a private league and invite friends by code, or play solo against the standings. Points
come from qualifying, the sprint where there is one, and the race, and the table updates as
each session is scored.

Your account travels with you. Sign in with Amazon, Apple or Google, and the team you built on
one device is the team you find on the next.
```

## Product feature bullets

```
Five drivers and a constructor inside a season-long budget
Prices that move with form, and contracts that expire
Name an Ace for double points, right up to lights out
Private leagues by invite code, or play against the global table
One account across Amazon, Apple and Google sign-in
```

## Compliance checklist

Run this against every field before submitting — the policy is at
https://developer.amazon.com/docs/policy-center/listing-promo.html#metadata

- [ ] No word or phrase repeats within a single field, and the title does not repeat the
      developer name
- [ ] No ALL CAPS and no emoji anywhere
- [ ] No prices, no IAP prices, no ASINs
- [ ] English only (the exception is apps targeting Germany or Japan alone, which this is not)
- [ ] No trademark watchlist terms in any **name**: F1, Formula 1, FIA, Grand Prix
- [ ] No real team or driver names in the listing text or screenshots. The Amazon screenshot set
      in `pics/amazon_appstore/` is the neutral one; the team-themed shots under `pics/`
      (`appstore_12_ferrari_theme.png`, `appstore_13_ferrari_home.png`) are **not** for Amazon
- [ ] Screenshots show this app, at the sizes the portal asks for

## History

- **2026-10-04** — 2.4.1 rejected: *"Your app contains title that violates our metadata quality
  guidelines by using repetitive words or phrases."* Primary Validation passed, so the APK was
  never the problem. Title set to the above and resubmitted with the 2.4.3 build (vc68) rather
  than 2.4.1, which had never been published.
- **2026-10-04, same day** — metadata updated to the copy in this file and **versionCode 68
  submitted**, awaiting review. The rejected title was not recorded before it was overwritten,
  so we still do not know which word repeated — if Play or Apple ever bounce for the same
  reason, that is the first thing to capture.
