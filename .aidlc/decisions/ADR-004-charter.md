# ADR-004: Charter, a second product beside the Pit Wall Pass

Date: 2026-11-24
Status: accepted (owner decision)

## Decision
1. Undercut sells a **second** premium product: **Charter**, `pitwall.charter.season`, **$39.99 per
   league per season**. It charters one league: every approved member reads paid Pit Wall while they
   remain in that league, and the league is League Pro for that season.
2. The Pit Wall Pass (ADR-001) is unchanged: `pitwall.pass.season`, $14.99, per user. The pass does
   not charter a league, and a Charter does not give the buyer a pass to carry elsewhere. A
   commissioner with two leagues buys twice.
3. Charter is sold through Stripe, Google Play and the App Store only (no Amazon), and only while
   `config/app.charter.enabled === true`, which defaults to false. Nothing is sold while Pit Wall
   content is open (`PITWALL_CONTENT_OPEN`).
4. Charter access is its own field, `users/{uid}.charterAccess.leagues[leagueId] = expiresAt`, kept
   by the server. A Charter purchase, a join, a leave and a Charter refund never write
   `users/{uid}.pass`, and never call `grantPass` or `revokePass`. The `pw` auth claim is the later
   of an active pass and the latest charter access.
5. A chartered league is public with approval on, and stays so until the charter ends. Chartered
   leagues rank above other public leagues in search, by members' points, lifted up to three places
   a week by Rank Ups.
6. The member cap stays 22 approved members.
7. The personal pass keeps making the leagues its holder owns Pro (`markOwnedLeaguesPro`), as before. A Charter makes Pro only the league it was bought for. Charter access never makes any league Pro.

## Why
Until now League Pro was derived from the owner's personal pass (F-060, F-061): the owner's $14.99
covered their own Pit Wall access, and the other members got at most a 7-day trial. Charter is the
owner's decision to sell the league as the unit, so one purchase covers every player in it, while
the personal pass stays as it is. Keeping the two entitlements in separate fields is what stops a Charter member
from making their own leagues Pro, or losing a pass they paid for when they leave a league
(docs/design/charter/BUILD.md, "The entitlement trap").

## Consequences
- ADR-001 stays the record of the personal pass and is not edited. Its decision 1 ("one premium
  product", "no separate League Pro purchase") is superseded in those words by this ADR.
- F-060 and F-061 are deprecated in the registry, superseded by F-175.
- The full build plan, and what was found when it was checked against the code on 2026-11-24, is
  `docs/design/charter/BUILD.md`. The spec is `.aidlc/specs/F-175.md`.
- The +20 slot pack (`league.expansion`) is retired (owner decision 2026-11-24): the app no longer
  sells it; credits already paid for still apply; the server keeps validating and applying it until
  the store listings are removed. Leagues stay at 22 members.
