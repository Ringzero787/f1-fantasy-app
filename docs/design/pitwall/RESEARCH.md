# Pit Wall — research notes (2026-09-19)

Survey of how betting-research, fantasy-optimizer and motorsport analytics products organise their reports, used to choose the Pit Wall frames. Web research by a sub-agent; items marked (K) are from general knowledge and were not re-checked. Not reached: BettingPros, FantasyPros, RotoGrinders/LineStar, GridRival, f1-dash/MultiViewer, Formula Data Analysis, the official fantasy game's stats pages.

## Frame catalogue, grouped as it maps to Pit Wall pages

**Briefing / slate overview**
- Projection board (FantasyLabs Player Models, Fantasy Football Fix, F1 Fantasy Tools weekly sims): sortable table of median, floor, ceiling, price, points per price unit, ownership. FantasyLabs defines ceiling as the score beaten about 15% of the time. Click a row for the asset panel.
- Implied-probability board (Oddschecker grid): drivers x markets matrix. For us: model win, podium, top-10 and DNF percentages, never bookmaker odds.
- Line-movement chart (Betfair price graph): for us, projected points from FP1 through qualifying.
- Consensus and expert picks (Fantasy Football Hub, Fantasy Football Fix Elite XI): cards plus agreement %.

**Asset research (slide-over)**
- Hit-rate table (Props.cash, Outlier): bar strip of recent results against an adjustable threshold, L5/L10/L20/season. Outlier colours: green at 65%+, yellow 45 to 65, red below 45.
- Plus/Minus and Consistency (FantasyLabs): points versus what the price implies; % of events beating expectation.
- Form sparklines and splits: street, high-speed, high-downforce, wet, sprint weekends.
- Trends query builder (FantasyLabs Trends): user-defined filter returns historical plus/minus. Later.
- Season performance profile (AWS broadcast graphics): qualifying pace, starts, lap one, race pace, tyre management, pit stops, overtaking.

**Matchups**
- Teammate head-to-head split bars; any-two compare with a pinned compare tray; lap-by-lap race trace (TracingInsights) as the drill-down.

**Pace Lab (timing-derived, therefore free only, ADR-001)**
- Lap-time heat map (TracingInsights): driver x lap, click a cell for that lap.
- Long-run pace and tyre degradation by compound; qualifying versus race pace quadrant scatter; sector-rank matrix against circuit profile for a fit score; pit stop medians and strategy what-ifs.

**Market**
- Price-change predictor (F1 Fantasy Tools Budget Builder: points needed per price step with sim odds; LiveFPL and Fantasy Football Fix predictors).
- Value board; ownership and leverage (FantasyLabs leverage = ownership rank minus ceiling rank; LiveFPL effective ownership, threats, templates; F1 Fantasy Tools elite-manager data). For us: ace-weighted effective ownership inside the user's league, threat versus differential.
- Template team among top-ranked managers.

**Lineup Lab**
- Optimizer with budget, locks, excludes, own estimates (F1 Fantasy Tools Team Calculator).
- Sim-based lineup EV (SaberSim, Stokastic): rank lineups by win or top-X probability against the field, with correlation and ownership. For us: teammates and constructors correlate; safety-car variance.
- Transfer planner (Fantasy Football Hub, LiveFPL); Hindsight (F1 Fantasy Tools): optimal past team and the gap; Rate My Team with suggested swaps.

**Season**
- Fixture difficulty ticker (FPL FDR): assets x next N events, colour-coded. For us: circuit fit per car per round, sprint weekends flagged.
- Power rankings; title simulation fan chart; power-unit component and penalty tracker; weather impact and wet/dry deltas.

**My performance (bankroll analogue)**
- ROI tracker (Pikkit, closing-line value). For us: team value growth, points against optimal and template, decision quality by category, projection at lock versus actual.

**News and alerts**
- Impact-tagged feed (K): asset, direction, magnitude, category, link out. Alerts on price threshold, projection swing, penalty confirmed, rain probability, lock reminders.

## Density patterns (how these sites avoid long pages)
Sticky context bar that drives every widget; master-detail with a right slide-over instead of navigation; tabs inside cards (L5/L10/season, quali/race/sprint); cross-filtering on click; frozen first column; column-set presets (Value, Ownership, Pace); inline sparklines and heat-shaded cells in place of separate charts; pinned compare tray; saved views; a heat map used as an index into detail.

## What is usually free and what is paid
Free: raw stats, a basic optimizer, a basic price predictor, live scoring. Paid: account linking and personalisation, team/league/rival analyzers, planners, sim builders, elite team reveals, AI assistants, alerts, ad removal, community access.

| Product | Price |
|---|---|
| F1 Fantasy Tools | EUR 2.50 / 4.50 / 6 per month, billed annually |
| Fantasy Football Fix | GBP 3.48 to 3.98 per month; GBP 295 lifetime |
| Fantasy Football Hub | GBP 4.98 / 7.98 / 29.98 per month, billed yearly |
| Props.cash, Outlier | USD 19.99 per month |
| Action Network PRO | about USD 30 per month or about USD 60 per year (sources disagreed) |
| Unabated | USD 99 to 199 per month |
| OddsJam | USD 39 to 999 per month |

A fantasy audience for this sport sits in the FPL-style band, roughly EUR 3 to 8 per month or 25 to 60 per season. It will not pay betting-tool prices. The owner chose USD 14.99 per season.

## Legal cautions
- **OpenF1:** "intended for educational purposes, personal learning projects, research, and non-commercial fan engagement"; "For other use cases, please contact us to discuss appropriate licensing." Sponsor tier EUR 9.90 per month (live data, higher limits) is a sponsorship, not a commercial licence. Verified on openf1.org 2026-09-19.
- **FastF1:** MIT code, but the data comes from the series' live-timing endpoints, which the project does not own.
- **formula1.com legal notices:** personal, non-commercial use; copying and commercial exploitation prohibited. Scraped live timing or telemetry is the riskiest input for a paid product. Prefer derived aggregates, no live-timing mirror; a licensed feed (Sportradar-class, K) if real-time ever becomes core.
- **Jolpica (Ergast successor):** own terms and rate limits (4 requests per second, 500 per hour; 200 unauthenticated). Cache server-side and read the commercial clause. Results and classifications are facts and low risk; EU database right is a residual consideration (K).
- **Trademarks:** "unofficial, not affiliated" disclaimer; keep the watchlist terms out of product, page and tier names.
- **LLM news summaries:** a 2026 ruling against Cohere held that substitutive summaries can plausibly infringe even when not verbatim; hot-news misappropriation is a further risk. Safe pattern: one or two sentences in our own words stating the fantasy impact, always link out with attribution, never reproduce structure, quotes or paywalled text, prefer RSS headlines, governing-body documents and team releases, honour robots.txt and AI opt-outs, human spot-check for defamation and invented penalties.

Sources: f1fantasytools.com (home, pricing, budget builder), fantasyfootballfix.com/premium, fantasyfootballhub.co.uk, livefpl.net, help.outlier.bet, betsmart.co comparison of Outlier and Props.cash, support.fantasylabs.com glossary and Trends article, stokastic.com comparison article, sabersim.com, actionnetwork.com/pricing, pikkit.com closing-line value, betangel.com Betfair charts, tracinginsights.com, f1-tempo.com, aws.amazon.com/sports/f1, openf1.org, github.com/theOehrly/Fast-F1, github.com/jolpica/jolpica-f1, formula1.com legal notices, copyrightlately.com on the Cohere ruling.
