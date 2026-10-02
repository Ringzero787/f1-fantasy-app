# Undercut — Roadmap

Grounded in the state of the app after the 2026-06 scoring overhaul. The engine and
economy are server-authoritative and verified against three live races; this is what to
build on top of that, roughly in priority order. Effort is rough: **S** ≤ half-day,
**M** ~1–2 days, **L** multi-day.

---

## Now — correctness & safety gaps still open
These are known holes the audit/monitoring surfaced but didn't close.

- **Lock teams created right before qualifying (S).** `autoLockTeams` only sweeps teams
  that exist when quali is ≤60 min away; a team created inside that window never locks for
  the weekend and can be edited post-quali. Lock at creation if inside a race window, or
  sweep continuously.
- **Gate Phase 1 scoring on `addedAtRace` (M).** Scoring currently credits whatever roster
  exists at scoring time. It's mitigated by rules + callable lock checks, but a belt-and-
  suspenders `addedAtRace < round` gate in Phase 1 would make it impossible to score a
  driver for a race they didn't hold.
- **Promote the reconciliation guard to an alert (S).** Phase 1 already re-derives team
  points from the breakdown and logs mismatches — but only `console.error`. Wire it to a
  push/email/Slack alert so a divergence pages someone instead of sitting in logs.
- **Delete dead `src/services/scoring.service.ts` (S).** Divergent, unused client scoring
  code — a trap for anyone who wires it into UI expecting server parity.

## Next — observability & ops
Make the system tell you when it's wrong, and make releases less manual.

- **Scheduled post-race verifier (M).** Turn `functions/scripts/verifyRaceScoring.js` into
  a scheduled function that runs after each race and alerts on any failed invariant
  (NaN totals, member/team drift, duplicate price-history, unscored completed race).
  Catches the next "Monaco silently didn't score" automatically.
- **Automated results cross-check (M).** The settle delay reduces post-penalty errors, but
  a periodic compare of ingested finishing order vs a second source would flag ingestion
  drift (the kind that needed a manual Barcelona re-score).
- **One-command deploy (S).** The functions deploy currently needs the manual ADC-swap
  dance. Wrap it in a script (or fix ADC) so deploys aren't error-prone.
- **Address the 70 Dependabot alerts (M).** Pre-existing; worth a dependency-bump pass.

## Next — economy polish
Small correctness/UX items the audit noted as low severity.

- **Post-race penalty re-score path (M).** Settle delay prevents *new* misses; for the rare
  late penalty after scoring, a proper `rescoreRace` callable (vs the one-off script) would
  let admins re-ingest + re-score safely. Needs per-race roster/ace snapshots to be fully
  correct (see below).
- **Store per-race roster + ace snapshots (M).** The Spain re-score had to *assume*
  current ace = race ace. Persisting a small per-team per-race snapshot makes any future
  re-score exact and unlocks accurate historical breakdowns.
- **Live-price the member/profile views (S).** Member team view and the profile sheet show
  stored `currentPrice`; My Team enriches from live prices. Unify so values match.
- **Fix `useDrivers` cache version-key collision (S).** Offsetting price changes can leave
  the key unchanged and serve stale prices. Hash per-driver prices or use a server stamp.
- **One-time price-history dedupe (S).** Cosmetic duplicate rows on australia/miami from
  the pre-idempotency era; tidy the two affected price charts.

## Later — product & engagement
Now that scoring is trustworthy, lean into retention.

- **Season recap / share card (M).** Extend the weekend recap into an end-of-season summary
  and a shareable image (best race, biggest climb, season rank). Drives organic growth.
- **Richer notifications (M).** Results-ready, price-mover alerts, ace-not-set reminder,
  lock-in-1-hour nudge — all on the push/email infra already built. Add per-type opt-outs.
- **Head-to-head / rivalries (L).** Surface league rival deltas ("you're 12 pts behind X")
  in standings and notifications.
- **Achievements / streaks (M).** Lightweight badges (full season hold, perfect ace pick,
  podium streak) — cheap engagement using data already scored.

## Later — platform
- **In-app update prompts via Play (M).** Add `expo-in-app-updates` for a one-tap upgrade
  flow, complementing the remote-config gate already shipped.
- **iOS release (L).** `app.config.js` iOS `buildNumber` is stale (36) and there's no
  numeric App Store ID on file. Decide if/when iOS ships; if so, do a build + TestFlight
  pass and record the App Store ID (the version gate's `iosUrl` is a placeholder).

---

## Parked — help picking a team, free and paid (2026-10-02)

Not scheduled. Written down now because the shape matters more than the timing, and the
timing is "once the stores and the pass have settled".

**The problem, in evidence.** The R16 audit found **37 of 40 teams on cheapest-first
auto-fill**. That is not 37 people choosing a strategy; it is people running out of budget
or out of patience and letting the lock fill the slots. Two moments cause it: a new player
facing twenty drivers and one budget with nothing to anchor on, and a returning player with
two empty slots and whatever money a sale left behind. Both are arithmetic problems the app
makes the person do in their head.

**What came out before, and why it is not the answer.** There was a *suggested build* that
filled the whole roster. It went because it answers the question for you: the first thing a
player does is undo it, which teaches them nothing, and a team the game built is not a team
you argue about in the league. Anything here has to leave every decision with the player.

**Free tier — arithmetic, not predictions.** Points per dollar from the season that has
already happened, which needs no model and no pass:

- **Value on every row.** `points ÷ price` over the rounds played, shown the way price and
  points already are, and available as a sort. It is a fact about the past, so it is honest
  for everyone and cheap to compute from data the client already holds.
- **Budget, forward.** With a pick pending: "leaves $420 for 3 slots", and the cheapest
  legal completion. The trap is never one expensive driver; it is an expensive driver plus
  three slots that cannot be filled. Saying the number out loud is most of the fix.
- **Pairings, after the first pick.** The player commits to a driver, and then two or three
  remaining entries carry a *reason*, not a ranking: `LEAVES $420 FOR 3`, `TEAMMATE — SAME
  CAR`, `CHEAP + SCORES`. A hint on a row they were going to tap anyway. No accept button,
  nothing moves without a tap, and the list must not reorder under a finger mid-scroll.
- **Returning players get the same thing, scoped.** Filling two slots after a sale is the
  same arithmetic with a smaller budget and a shorter list; it should not be a separate
  feature, and the hints should fade once a team is built — a veteran does not need coaching.

**Paid tier — the pass keeps the model.** Projections for the coming round, the swap the
model would take, best value against a forecast rather than against history, and the
reasoning behind each. That line is already where ADR-001 drew it: timing-derived and
historical frames are free, modelled ones are the pass. Keeping the free tier to honest
division is what makes the paid tier worth $15 — and a free player who can at least not
bankrupt themselves is a player who stays long enough to consider paying.

**Rules this has to keep.**
- Never writes a roster. Every suggestion is a hint on a row the picker already allows, so
  it can never propose a move the budget or a lockout forbids (the same rule F-077's marks
  follow).
- The free math is computed from data already on the device. No new payload, no new call.
- Scope the onboarding version to a first team ever, and leave the current flow untouched
  for everyone else.

## Guiding principles (learned this cycle)
- **Server is the source of truth.** Roster/economy/scoring are server-authoritative;
  keep new value-bearing logic out of the client.
- **Fail loud, never silently zero.** A NaN or unscored race should alert, not coerce.
- **Idempotency on every re-runnable path.** Stamp + deterministic ids, as the market
  phases now do.
- **Validate against reality.** Internal consistency isn't enough — cross-check ingested
  results against the real race (Austria matched exactly; Barcelona didn't).
