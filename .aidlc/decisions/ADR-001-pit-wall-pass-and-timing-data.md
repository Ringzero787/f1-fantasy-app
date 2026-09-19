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
- League Pro is derived from the owner's pass (F-060), so there is one purchase flow, one product in each store and one entitlement to support.
