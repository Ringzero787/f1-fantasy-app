# Undercut — Moonshot

*Owner's design document, as delivered on 2026-10-06. Kept verbatim (light re-flow only; there was no §22 in the source). Implemented by F-106 to F-109.*

## Feature Summary

Moonshot is a second-half-of-the-season, high-risk/high-reward mechanic designed to keep fantasy leagues competitive and exciting even when managers have fallen significantly behind the league leader.

Beginning at approximately the halfway point of the Formula 1 season, managers unlock a limited number of **Moonshots**.

A Moonshot allows a manager to:
1. Select an F1 driver.
2. Make a prediction about that driver's race result.
3. Risk either Championship Points or in-game Cash/Coins.
4. Receive a multiplier based on the difficulty of the prediction.
5. Gain the stated reward if the prediction succeeds.
6. Lose the amount staked if the prediction fails.

Moonshots are intentionally scarce. They should feel like major strategic decisions rather than routine bets.

The feature should use fantasy-game terminology throughout the application. Use: Moonshot, Call, Prediction, Stake, Risk, Reward, Multiplier, Hit, Miss, Double Down. Avoid sportsbook terminology such as: Bet, Wager, Sportsbook, Gambling, Betting odds, Moneyline, Parlay, +500 / −150 style odds.

All Moonshot currencies are internal, nonredeemable game resources.

## 1. Primary Design Goal
The core problem Moonshot solves is late-season disengagement. In a season-long fantasy league, a manager who falls substantially behind may conclude that catching the leader is mathematically unrealistic. Moonshot creates a path back into contention without simply giving losing managers free points. The player must **take more risk to create more upside.** The guiding design principle is: *Comeback opportunity, not comeback assistance.* A player who is behind should have an opportunity to make an aggressive strategic move, but must correctly predict an unlikely outcome to benefit.

## 2. Unlock Timing
Moonshots unlock when the F1 season reaches approximately its halfway point. The exact unlock round MUST be server configurable (`moonshot_enabled`, `moonshot_unlock_round = 13`, `moonshots_per_team = 3`, `max_moonshots_per_race = 1`). Do not hardcode Round 13. Before the configured unlock round, Moonshot UI may appear locked with explanatory text: "MOONSHOTS UNLOCK AT MIDSEASON — High-risk predictions arrive during the second half of the championship."

## 3. Moonshot Allocation
Each fantasy team receives 3 Moonshot Tokens for the remainder of the season. Default rules: 3 per team per season; available from the configured midseason round; maximum 1 per race weekend; unused carry forward; unused expire at season end; a token is consumed once the Moonshot locks; cancelled before lineup lock does not consume the token; cannot be created after the race weekend's configured lock time. All values MUST be remotely configurable.

## 4. Starting Moonshot Markets
V1 should deliberately have a small number of understandable predictions: **TOP 5** (P1–P5), **PODIUM** (P1–P3), **WIN** (P1), **EXACT FINISH** (exact finishing position; highest risk, largest multiplier). Top 10, Beats Teammate, Head-to-Head, Qualifying Result, Fastest Lap etc. can be added later. Do not overload V1.

## 5. Driver Interaction
Moonshot originates from the existing driver experience: tapping a driver tile/card, the driver detail interface contains **🚀 MOONSHOT**, which opens the Moonshot sheet, e.g. "CHARLES LECLERC — 🚀 CALL A MOONSHOT — TOP 5 · Model Chance 76% · Reward 0.5× / PODIUM · 43% · 1.25× / WIN · 16% · 5× / EXACT FINISH · Choose Position · up to 8×". The probabilities come from the Undercut prediction/modeling system. The player does NOT need to understand the underlying statistical model.

## 6. Model Probability
The prediction model provides a probability distribution for each driver's expected finishing position (P1 16%, P2 15%, P3 12%, P4 11%, P5 10%, P6 8%, P7 7%, P8+ remaining). These aggregate into predictions: WIN = P1 (16%); PODIUM = P1+P2+P3 (43%); TOP 5 = P1…P5 (64%). The model probability is then converted into a Moonshot difficulty/reward band.

## 7. Reward Bands
Do NOT calculate sportsbook-style decimal odds directly from 1 / probability. Use controlled game reward bands:

| Model Probability | Classification | Reward |
|---|---|---|
| 65–85% | SAFE | 0.5× |
| 40–64.99% | BOLD | 1.25× |
| 20–39.99% | LONGSHOT | 2.5× |
| 8–19.99% | MOONSHOT | 5× |
| Below 8% | EXTREME | 8× |

Thresholds and multipliers MUST be server configurable (`rewardBands: [{ minProbability, maxProbability, label, multiplier }]`). The server remains authoritative regarding the actual multiplier.

## 8. Stake Selection
For V1, avoid a complicated slider. Present three stake levels for Championship Points — 50 / 100 / 200 — configurable, optionally labelled CAUTIOUS / BOLD / ALL-IN. The application ALWAYS shows the exact potential result before confirmation ("🚀 LECLERC — WIN · Model Chance 16% · MOONSHOT 5× · Your Stake 100 Championship Points · IF IT HITS +500 · IF IT MISSES −100 · [CALL THE MOONSHOT]"). No ambiguity about what the player can gain or lose.

## 9. Points Moonshot
Affects the league standings directly. The stake is not removed immediately; it is recorded as **at risk**. On settlement: success `moonshotAdjustment = +500`; failure `moonshotAdjustment = −100`. Moonshot adjustments MUST be stored separately from normal fantasy scoring so standings can display Race Points, Season Points, Moonshot Points, Total Points.

## 10. Cash Moonshot
Players may alternatively risk in-game Cash/Coins, affecting roster-building ability rather than standings (Bank 240 · Stake 100 · Hadjar Podium · 5× · SUCCESS +500 · FAILURE −100). Resulting cash is used normally within the roster/contract economy. Points and Cash Moonshots use the same prediction system but affect different currencies.

## 11. Currency Selection
"WHAT ARE YOU RISKING? 🏆 CHAMPIONSHIP POINTS — Move up the standings. 💰 CASH — Build a stronger roster." A manager with a strong roster but a large deficit may risk Points; one close to the leader but unable to afford stronger drivers may risk Cash.

## 12. Double Down
Players SHOULD be allowed to Moonshot drivers already on their roster, presented as a feature: "🔥 DOUBLE DOWN — Leclerc is already on your roster. Think he's winning Monaco? Risk 100 Points · WIN → +500 · MISS → −100." This increases exposure because a poor result already hurts the normal score.

## 13. Moonshot Confirmation
Explicit confirmation step ("🚀 CONFIRM MOONSHOT · CHARLES LECLERC · WIN THE MONACO GRAND PRIX · Model Chance 16% · Stake 100 Points · Reward 5× · HIT +500 · MISS −100 · This Moonshot locks when race selections lock. [CONFIRM MOONSHOT] [CANCEL]"). Never placed through a single tap.

## 14. Probability Snapshot
On confirmation the server MUST save the model state used: driverId, raceId, predictionType, predictionTarget, modelVersion, modelProbability, rewardBand, multiplier, stakeCurrency, stakeAmount, createdAt, lockedAt, probabilitySnapshotId. The multiplier MUST NOT change after confirmation/lock because the model later updates. The player receives the terms shown when confirmed.

## 15. Locking
Moonshots lock at the same configured deadline used for the applicable race selections unless Moonshot-specific configuration overrides it. Before lock: cancel or modify. After lock: cannot be changed. The server MUST enforce the lock; do not rely on client-side validation.

## 16. Public League Declaration
Once locked, the Moonshot becomes visible in the league activity feed ("🚀 NATHAN CALLED HIS SHOT · HADJAR — PODIUM · 200 POINTS AT RISK · MODEL CHANCE 11% · REWARD 5× · Potential Gain +1,000"). Private until lock, public after lock, to prevent copying.

## 17. Race-Day Experience
Active Moonshots appear prominently during the race ("🚀 YOUR MOONSHOT · HADJAR · PODIUM · Current Position P4 · ONE POSITION AWAY · 200 POINTS AT RISK · Potential Reward +1,000"), updating with live race position data when available. States: IN, OUT, CLOSE, HIT, MISSED, PENDING. The live experience is a major part of the feature: something specific to watch during the race.

## 18. Settlement
Settled by the same authoritative backend process responsible for final race results/scoring. MUST be server authoritative, idempotent, auditable, safe to rerun, based on official finalized race results. Success: "🚀 MOONSHOT HIT · HADJAR — PODIUM · Called PODIUM · Finished P3 · Stake 200 · Reward 5× · MOONSHOT POINTS +1,000". Failure: "💥 MOONSHOT MISSED · LECLERC — WIN · Called P1 · Finished P2 · Stake 100 · MOONSHOT POINTS −100".

## 19. DNF / DNS / DSQ Rules
Default DNF = loss. Recommended: DNF = LOSS, DNS = VOID, DSQ = LOSS, Race Cancelled = VOID; MUST be configurable. A void returns the token and creates no points/cash adjustment.

## 20. Tooltip / First-Time Education
When Moonshots unlock, a short guided overlay: (1) highlight a driver tile — "🚀 MOONSHOTS ARE HERE · Tap any driver to call your shot."; (2) highlight prediction choices — "PICK YOUR CHALLENGE · Harder predictions earn bigger rewards."; (3) highlight stake — "CHOOSE YOUR RISK · Risk Championship Points to climb the standings or Cash to strengthen your roster."; (4) "YOU GET 3. Choose wisely. [START MOONSHOTTING]". Auto-display once; help remains available through an information icon; text preferably server configurable.

## 21. Advanced Model Information
Keep the default interface simple. Advanced users may tap "WHY THIS MULTIPLIER?" for deeper model information (Model Probability 16% · Expected Finish P3.4 · Likely Range P1–P6 · Circuit Performance Strong · Recent Form Strong · Qualifying Projection P2 · Confidence Medium). The model can be sophisticated without requiring casual users to understand it.

## 23. Suggested Data Model
`moonshots/{moonshotId}`: id, seasonId, leagueId, teamId, userId, raceId, roundNumber, driverId, predictionType, predictionTarget, stakeCurrency, stakeAmount, modelVersion, modelProbability, probabilitySnapshotId, rewardBand, multiplier, potentialReward, status, createdAt, updatedAt, lockedAt, settledAt, officialDriverFinish, result, adjustmentAmount, settlementVersion, settlementId. Status values: DRAFT, CONFIRMED, LOCKED, LIVE, HIT, MISSED, VOID, SETTLED, CANCELLED.

## 24. Server-Side Requirements
The server is authoritative for availability, remaining tokens, race and driver eligibility, model probability, reward band, multiplier, maximum stake, currency balance, championship point balance, lock time, final result, settlement, token consumption. The client MUST NOT be trusted to provide probability, multiplier, potentialReward, raceResult, settlementAmount. The client requests a quote; the server returns the authoritative quote; the player confirms that quote.

## 25. Recommended API Flow
Request quote `POST /moonshots/quote` `{ raceId, driverId, predictionType, stakeCurrency, stakeAmount }` → `{ quoteId, modelProbability, rewardBand, multiplier, stakeAmount, potentialReward, expiresAt }`. Confirm `POST /moonshots/confirm { quoteId }` validates the quote and creates the Moonshot. Cancel `POST /moonshots/cancel` before lock only. Retrieve `GET /moonshots`, `GET /moonshots/{id}`, `GET /leagues/{leagueId}/moonshots`. Settlement occurs server-side from official race results and should not require a client request.

## 26. Idempotency
Settlement MUST be idempotent: the same scoring job may run multiple times; never reward or deduct twice. Store a unique settlement identifier `seasonId + raceId + moonshotId + settlementVersion` and verify before applying any adjustment.

## 27. Audit Trail
Retain enough to reconstruct exactly what happened. Never overwrite: original model probability, multiplier, stake, prediction, model version, lock timestamp, official result used, settlement adjustment. Needed for support disputes and league transparency.

## 28. League Standings
Moonshot effects remain identifiable: "Nathan · Race Points +187 · Moonshot +500 · Race Total +687 · Season Total 4,852". Season statistics may include Moonshots Used, Hit, Missed, Points Risked, Points Won, Cash Risked, Cash Won, Biggest Moonshot.

## 29. League Feed
Feed entries: "🚀 Nathan called a Moonshot. Hadjar → Podium · 200 Points at Risk · 5× Reward"; "🔥 MOONSHOT HIT · Nathan called Hadjar Podium. Hadjar finished P3. +1,000 Points"; "💥 MOONSHOT MISSED · Mike called Norris Win. Norris finished P2. −100 Points". Part of the league's season history.

## 30. Season Recap
Awards: 🚀 MOONSHOT OF THE YEAR, 🔥 BIGGEST HIT, 💀 BIGGEST MISS, 🎯 MOST ACCURATE, 😈 BIGGEST RISK TAKER (e.g. "MOONSHOT OF THE YEAR · Nathan · Hadjar — Podium · Austin GP · 11% Model Probability · 200 Points Risked · +1,000 Points Won"). Transforms Moonshot into part of the league's social history.

## 31. Remote Configuration
Nearly every economic parameter remotely configurable: enabled, unlockRound, tokensPerTeam, maxPerRace, predictionTypesEnabled, pointsStakeLevels, cashStakeLevels, rewardBands, maxMultiplier, DNFRule, DNSRule, DSQRule, hideBeforeLock, tutorialEnabled, finalMoonshotEnabled, finalMoonshotStartRound, finalMoonshotLeaderEligible, finalMoonshotMaxStakePercent. No app release to rebalance.

## 32. Analytics
Events: moonshot_tutorial_viewed, _opened, _driver_selected, _prediction_selected, _currency_selected, _stake_selected, _quote_viewed, _confirmed, _cancelled, _locked, _hit, _missed, _void, _live_viewed, _model_details_viewed. Metrics: % of eligible players using it, Moonshots per player, average stake, Points vs Cash usage, prediction-type distribution, average model probability selected, hit rate, average reward, engagement among trailing players before/after unlock, league activity after Moonshot events, retention outside top 3, % of leagues whose champion changed after midpoint, % of championship points from Moonshots. The most important success metric: **does Moonshot keep managers who are behind engaged later into the season?**

## 33. Economic Guardrails
Configurable limits: maximum stake, maximum multiplier, maximum reward per Moonshot, maximum Moonshot points per season. Initial: maxPointsStake 200, maxCashStake 200, maxMultiplier 8, maxSingleMoonshotPointReward 1000, maxSeasonMoonshotPointGain 1500. Validate through simulation before launch. A manager should be able to make a dramatic comeback; a manager should NOT be able to ignore the game all season and win solely on one extremely unlikely prediction.

## 34. UX Principle
Fantasy strategy + prediction + courage; NOT a sportsbook embedded inside Undercut. The model does the complicated work; the player sees Driver, Prediction, Chance, Risk, Reward ("🚀 HADJAR — PODIUM · 11% chance · Risk 200 Points · 5× MOONSHOT · HIT +1,000 · MISS −200 · [CALL IT]"), understandable within seconds.

## 35. V1 Scope
V1 SHOULD include: midseason unlock; 3 tokens; one per race; driver selection; Top 5, Podium, Win; Points and Cash stakes; model probability; reward bands; server-side quote; confirmation; locking; race settlement; league feed; live status; first-time tutorial; history; analytics; remote configuration. V1 SHOULD NOT require: head-to-head; parlays / multi-driver; user-created markets; complex sliders; betting-style odds; trading; exact-position predictions if model calibration is not ready; Final Moonshot / Dark Side of the Moon.

## 36. Acceptance Criteria
Complete when: eligible players automatically receive the configured Moonshots at the configured point; a player can tap a driver and open Moonshot; the server returns predictions, classifications and multipliers; Points or Cash selectable; a valid stake selectable; exact gain/loss displayed before confirmation; server validates and stores; changeable/cancellable before lock; immutable after lock; locked Moonshots visible to league members; active Moonshots display during the race; official results settle automatically; settlement cannot execute twice; hits add the correct reward; misses deduct the correct stake; voids return the token with no currency change; Moonshot scoring appears separately; events appear in the league feed; economic parameters remotely configurable; analytics for the complete funnel.

## Product North Star
Moonshot should create moments where someone watching an F1 race says: *"I need Hadjar to gain ONE position and I get 1,000 points."* It gives trailing managers hope without free points, gives leaders another decision, makes midfield battles meaningful, creates memorable league moments. **A comeback must be earned by calling the shot correctly.**
