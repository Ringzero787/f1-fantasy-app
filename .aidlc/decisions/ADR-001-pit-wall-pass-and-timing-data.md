# ADR-001: One premium product, and timing data stays free

Date: 2026-09-19
Status: accepted (owner decision)

## Decision
1. Undercut sells one premium product: **Pit Wall Pass, $14.99 per season, per user**. It includes the full Pit Wall web portal and League Pro for every league the holder owns. No monthly price and no separate League Pro purchase.
2. The game stays free on Google Play, the App Store and the Amazon Appstore. The portal has a free look for every signed-in user, including a Rate My Team score.
3. **Paid features are built only on our own game data and race classifications.** Anything derived from the timing data source (laps, stints, pit stops, weather, race control) is shown in the free tier only and is never placed behind the pass.
4. The pass is sold on the web through Stripe and in the Play and iOS apps through in-app purchase. Stripe is built first so the flow can be tested during the 2026 beta.
5. The portal is named Undercut Pit Wall. Launch is February 2027, with a beta during the remaining 2026 rounds.

## Why
The timing source (OpenF1) states it is for non-commercial use, and formula1.com content is for personal, non-commercial use. Selling frames built on it would be commercial use. Race results are facts and our prices, ownership and scores are our own, so the paid tier does not depend on the timing source.

## Consequences
- Payload builders keep timing-derived data in `pw_public_timing`, and a test prevents pass-gated payloads from reading it (F-069, F-070).
- The projection model uses results, prices and circuit characteristics only.
- A kill switch (`config/app.pitwall.timingFrames`) hides timing frames without a deploy.
- Residual risk: timing frames still appear inside a product that promotes a paid upgrade. The owner sends the provider a permission request describing exactly this use; the reply is appended here. If the answer is no, the switch goes off and the paid product is unaffected.

## Answer from the provider (2026-09-28)

**Granted, on a paid feed: $10 a month**, which the owner starts paying when the portal goes live.
That removes the residual risk above and the reason for the constraint in decision 3 — the licence
is now a commercial one.

Decision 3 **stands anyway**, and not because it has to:

- The projection model's input allowlist (`workers/pitwall/src/model/inputs.ts`) is what lets us say
  the paid product is built on our own game data. A test pins that list. Widening it to timing data
  would trade a claim we can prove for frames that are nicer to look at.
- The free tier is the reason anyone opens the portal without a pass. Moving Pace Lab behind the
  pass would take the one page that is genuinely useful to a non-buyer and make the free look
  thinner, for a gain we did not need when the model already beats its baseline without it.

So the change this unlocks is narrow and worth doing on its own terms: **Pace Lab and the
timing-derived half of Circuit get real laps, stints and pit stops instead of the classification
stand-ins built in F-072**, and they stay free. `config/app.pitwall.timingFrames` remains the
switch. Nothing moves behind the pass.

The $10 a month is a cost of goods for the free tier, which is the right way round: the free tier is
what sells the pass.
- League Pro is derived from the owner's pass (F-060), so there is one purchase flow, one product in each store and one entitlement to support.

## Note · 2026-10-07 · a second consumer of the timing feed (F-111)

Moonshot's race-day card (F-108) shows each called driver's current position. It does not poll the provider from devices: one scheduled server sweep (`moonshotLiveSweep`) pulls positions once a minute while a race is in its window and writes `races/{raceId}/live/positions`; every client reads that document. Volume: one request a minute for ~3 hours per race, the same class as the existing results ingestion. The surface is free to every signed-in Undercut player and never behind the pass, consistent with decision 3. It is a different surface from the portal the provider's grant described, so the sweep ships behind `config/app.moonshot.liveTiming` (off), and the owner confirms with the provider that the arrangement covers the app surface before switching it on; when the paid feed's credentials exist the sweep moves to them.

## Note · 2026-10-25 · the paid feed is bought; the server authenticates (F-128)

OpenF1 now closes its free tier to everyone while a session is live, which is why every round this
season scored two to four hours after the flag (United States: 2h34m). The owner bought the paid
feed on 2026-10-25 under the 2026-09-28 reply above. Facts for whoever checks this later:

- The provider's site labels that tier **"real-time data access (personal use)"**, 6 requests a
  second and 60 a minute, with a contact form for non-personal use. The licence for Undercut's
  use is therefore the provider's written reply of 2026-09-28, not the product page. That reply
  is paraphrased above, not quoted; the owner holds it outside this repo (the permission request
  asked for it to be pasted verbatim, and it was not — do that when it is found).
- F-128 puts the feed's bearer token on every server call (results, qualifying, sprint, schedule
  sync and monitor, live sweep). Volume is unchanged: a handful of calls every ten minutes, one a
  minute during a live sweep.
- The 2026-10-07 note's first condition **still stands**: the live sweep's switch
  (`config/app.moonshot.liveTiming`) goes on only once the owner has the provider's written
  confirmation that the arrangement covers the in-app live positions card. The permission request
  of 2026-09-19 told the provider we fetch once per session and do not mirror live timing; the
  sweep is one `/position` call a minute for about three hours per race, positions only, server
  side, on a free surface that is never behind the pass. The restatement should say exactly that
  — **superseded on 2026-10-26 by the note below** (F-129: two calls a minute, a kept grid and
  entry list, and a derived running score); the restatement must describe that, not this.
  `DESIRED.liveTiming` in `setMoonshotConfig.js` stays **false** (F-128's review restored it: a
  `uc-script` op passes only `--apply`, so an armed default would flip the switch with any other
  config change); it is set true in the same change that raises the op, after that confirmation.

## Note · 2026-10-26 · the running score widens the in-app surface (F-129)

F-129 makes the same once-a-minute live document carry a running score — what each driver and
constructor would score for the race session at the current order — shown on the Team screen's
tiles and stat row for the race's three hours. Facts for the restatement to the provider and for
whoever checks this later:

- Volume: **two** feed calls a minute during a race once the grid is known (positions, and the
  whole laps table for the fastest-lap holder), three a minute until the grid is published (the
  grid is asked again each minute), and up to five on the first minute (session list, starting
  grid, entry list); each call is bounded at 20 s and may retry once on a 429. Server side
  only, inside the tier's 60 a minute. Still one Firestore document, still a free surface never
  behind the pass.
- What is kept, per race, in that document (readable by any signed-in user of the app, like the
  positions before it): the positions, the starting-grid slot per driver, the entry list (driver →
  team) and the id of the driver holding the fastest lap. Clients render none of these directly
  beyond the Moonshot card's positions; they render the derived score, which is our scoring
  formula over the provider's running order. Nothing else from the laps table is stored. The copy
  calls it a running score, not a result.
- The 2026-10-07 condition is unchanged and now covers this too: the switch goes on only once the
  owner has the provider's written confirmation that the arrangement covers **live positions and a
  derived running score inside the free app**. The owner's one-line restatement should say so.
