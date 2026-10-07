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
