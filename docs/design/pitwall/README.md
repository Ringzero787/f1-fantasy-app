# Handoff: Undercut Pit Wall and League Pro

For whoever builds this next on `master` (human or Claude session). This PR adds **plans only**: registry entries, specs, a prototype and an architecture. No app, functions or rules code changes. **Start with `SESSION-BRIEF.md`** (full analysis, evidence, decisions, repo state and step-by-step instructions), then this file, `ARCHITECTURE.md`, the ADRs in `.aidlc/decisions/`, and open `prototype.html` in a browser. `RESEARCH.md` is the platform survey behind the frames.

## What was decided (2026-09-18 and 19)

1. **Undercut stays free to download and play on all three stores.** No universal paywall. **One premium product** sits on top (owner decision, `.aidlc/decisions/ADR-001-pit-wall-pass-and-timing-data.md`):
   - **Pit Wall Pass, $14.99 per season, per user** (`pitwall.pass.season`). It includes the full Pit Wall portal (M-09, F-068 to F-075) **and** League Pro (M-08, F-060 to F-066) for every league the holder owns; members of those leagues get the Pro league features without paying. No monthly price, no separate League Pro purchase.
   - **Free look for everyone signed in:** Briefing headlines, top-10 median projections, Wire headlines, the lineup with manual editing, a **Rate My Team** score, and all timing-derived frames.
   - **Paid features use only our own game data and race results.** The timing source is non-commercial, so timing-derived frames (Pace Lab, circuit lap history, pit stops, stint degradation) are free only and never sit behind the pass.
   - Sold on the web through Stripe (built first, testable in the beta) and as a store IAP in the February 2027 app release.
2. **Competitiveness is never sold.** No paid points, budget, chips or lineups. The portal gives information and convenience.
3. **Undercut has never taken a payment.** Production `purchases` is empty, no league was ever expanded, and `react-native-iap` has been missing from `package.json` since v2.1.0 (`3ad87b6`) while `purchase.store.ts` still lazy-requires it. The three old products are retired without migration (F-061).
4. **The portal is Undercut Pit Wall.** Grid design system, this sport only, eight pages, **no page taller than three screens**, depth through click-ins. Not a betting product: model estimates, no bookmaker odds, no wagering words.

## What is in this PR

| Path | What |
|---|---|
| `.aidlc/features.yaml`, `.aidlc/specs/F-060..066.md` | League Pro feature set |
| `.aidlc/specs/F-068..075.md` | Pit Wall feature set (F-067 is the app icon feature, not part of this) |
| `.aidlc/roadmap.yaml` | Milestones M-08 and M-09 |
| `docs/design/pitwall/prototype.html` | Clickable prototype, example data, single file, no build step |
| `docs/design/pitwall/ARCHITECTURE.md` | Cloudflare hosting, identity, entitlement, data model, forge compute with GCP backup, in-app promotion, store policy |
| `docs/design/pitwall/SESSION-BRIEF.md` | Everything the planning session learned, and instructions for the next session |
| `docs/design/pitwall/RESEARCH.md` | Survey of betting, fantasy and motorsport analytics frames, pricing, legal cautions |
| `docs/design/pitwall/openf1-permission-request.md` | Draft email for the owner to send |
| `.aidlc/decisions/ADR-001`, `ADR-002` | Product and infrastructure decisions |

Each spec has testable acceptance criteria. The specs have **not** been through G02; run the spec gate when a feature's branch is opened and fix what it flags.

## How to read the prototype

- Open `prototype.html` directly. Tabs switch pages; the footer shows the live scroll budget for the current page.
- Click any driver or constructor, anywhere, for the Past / Present / Outlook slide-over.
- **Briefing:** the Recommendations list is clickable; each item compares the user's current pick against the recommended or nearest-priced alternative and can carry the swap into the Lineup Lab. Below it, Rivals' likely moves.
- **Lineup Lab:** tap a tile for the top pick to replace it plus a table of every affordable option; swaps update bank and projection live; Save is a stub.
- All numbers are generated in the file. Logic worth reusing: `recs`, `briefRecs`, `cmp`, `rivalMove` and the Lineup Lab swap pool. Layout, tokens and component treatments are the design reference; recreate them in the real stack, do not ship this file.
- Design system: `docs/design/grid/TRANSITION.md` section 3 applies unchanged (tokens for dark and light, Unbounded plus JetBrains Mono, radii 18/14/12/999, 1px borders, one red accent, team colours as small bars only).

## Build order

Work one feature per branch, `feat/F-###-slug`, Conventional Commits, `aidlc feature status <id> building` when you start. Say "Undercut" in each PR; none of this touches `newgame/`.

**Phase 0 — free engagement first (no store or licence dependencies)**
- F-062 race winners and per-race leaderboard. Ships in a normal app release. Gives League Pro and the portal the per-race data they need.

**Phase 1 — portal on our own data (no timing licence needed)**
1. F-075 shell: `web/pitwall/` (Vite, React, TypeScript) on Cloudflare Pages at `pitwall.humannpc.com`, op kind `pitwall-pages-deploy`, sign-in, the app to web handoff callables, Playwright scroll-budget test. Ship behind `config/app.pitwall.enabled = false`.
2. The forge worker skeleton (`workers/pitwall/`, `pw_jobs` lease queue, dedicated deploy checkout `/data/pitwall-worker`, op kind `pitwall-worker-deploy`), then F-070 projections v1 running on it from `raceScores` history through `scoringCore`, plus the price model from `updatePrices` rules. The backtest gate must pass before anything is shown to users.
3. F-073 lineup lab and the Briefing recommendations and rivals frames from F-072, all computed client-side from page payloads plus the user's own readable documents. Save goes through the existing team callables only.
4. Market frames from F-074 that use our data: price model, value, ownership, team value, hindsight.

**Phase 2 — getting paid**
5. F-068 first: Stripe checkout and webhook (test mode through the beta), `users/{uid}.pass` plus the `pw` claim, the shared `grantPass`, League Pro derivation for owned leagues, free-look gating in rules, beta allowlist and grant op.
6. F-060 then F-061 for the February 2027 app release: bring in-app purchase back (Play and iOS builds only; the Amazon APK must contain no Play Billing), sell the same pass in-app, League Manager shows Pro as included.
7. In-app surfaces from `ARCHITECTURE.md` section 8: Profile row first, then the upgrade sheet, then the two teasers. All driven by `config/app.pitwall`; change that document through an `uc-script` op, never by hand.

**Phase 3 — depth**
8. F-071 news wire and briefing. 9. F-069 timing pipeline and the free timing frames of F-072 (Pace Lab, Circuit). 10. F-074 Season. 11. F-063 to F-066 League Pro features.

## Beta, now to February 2027

The owner wants to test between now and launch. Plan:
- **Who:** the owner's two active leagues (Too Legit To Quit, Pedal To The Metal) plus invited testers, through `config/app.pitwall.beta = { uids, leagueIds }`. Everyone else sees nothing in the app.
- **Passes:** complimentary grants through the admin op (`source: 'grant'`). Stripe stays in test mode; run at least one full test-mode checkout, webhook, refund and expiry cycle per beta build.
- **Target:** first beta build for the United States round (late October 2026), which leaves about six race weekends of real use before the season ends. Treat the date as a target, not a commitment.
- **What to measure each round:** projection error and floor/ceiling calibration against the real scores (the F-070 backtest, now live), Rate My Team views, recommendation comparisons opened, swaps carried into the Lineup Lab, lineups saved from the web, week-over-week return rate, and written feedback from testers.
- **Exit criteria for launch:** the model beats the last-3-races baseline over the beta rounds, no entitlement or lineup-save defects open, one clean test-mode purchase cycle, IAP sandbox purchase verified on both stores, and the scroll-budget test green on every page.
- **Launch:** February 2027 with pre-season testing; pass on sale from day one at $14.99 for the 2027 season.

## In-app changes, concretely

- `src/services/remoteConfig.service.ts`: extend the `config/app` type with the optional `pitwall` block; keep it fail-open.
- `src/simple/grid/GridProfileScreen.tsx`: add a `LinkRow` under LEAGUE (`label` and value text from config; `accent` when the user has no pass). Handler: pass holders call `pw.createPortalHandoff` then `Linking.openURL`; others open the upgrade sheet.
- New `src/simple/grid/GridUpgradeSheet.tsx` following the avatar sheet pattern in the same file.
- `src/simple/grid/GridTeamPanel.tsx` and `GridWeekendRecap.tsx`: one teaser line each, capped per round.
- No change to `app/(tabs)/**` or `src/config/themes.ts` (same rule as the Grid handoff).
- Minimum app version for these surfaces is set in config (`minAppVersion`), so older builds simply show nothing.

## Owner actions (cannot be done from the repo)

- [ ] Send the timing data provider a short permission request describing the use (timing frames free, inside a product that also sells a pass). Append the reply to ADR-001. Not blocking: if the answer is no, turn off `config/app.pitwall.timingFrames`; the paid product does not depend on it.
- [ ] Cloudflare: create the Pages project `undercut-pitwall`, attach `pitwall.humannpc.com`, and issue an API token scoped to that Pages project for the deploy op.
- [ ] Firebase console: register a Web app (config and App Check) and add `pitwall.humannpc.com` to Auth authorized domains.
- [ ] forge: create the `pitwall-worker` service account key and `/etc/pitwall-worker.env`, and approve the systemd unit and timers.
- [ ] GCP: enable Cloud Run, Cloud Build, Artifact Registry and Cloud Scheduler on the project for the backup runner (can wait until after the beta starts).
- [ ] Stripe account, products and prices, Stripe Tax; webhook secret into Secret Manager.
- [ ] Play Console and App Store Connect: create `pitwall.pass.season` (one-time product on Play, non-renewing subscription on the App Store); Apple paid-apps agreement and banking; Google payments profile; Play service account order permissions.
- [ ] LLM API key into Secret Manager with a $40 per month budget alert.
- [ ] Terms and privacy pages updated for web payments.

## Do not

- Do not sell anything that changes scoring, budget or lineups.
- Do not put any timing-derived number behind the pass, and do not feed timing aggregates into the projection model (ADR-001).
- Do not show bookmaker odds or use wagering language anywhere.
- Do not redistribute raw timing data or mirror live timing; serve derived aggregates.
- Do not reproduce article text; two sentences in our own words plus a link out.
- Do not put a trademark watchlist term in a product, page, tier or pack name.
- Do not let the web write `fantasyTeams`, `users/{uid}.pass` or `leagues/{id}.pro` directly.
- Do not deploy functions, rules, the site, the worker or config outside `aidlc op`.
- Do not run the worker from `/data/f1-app` or any checkout where branches get switched; it runs only from the dedicated deploy checkout.
- Do not let forge and the GCP backup process jobs without the lease; every job is claimed in a transaction.
- Do not put purchase wording or web prices inside the iOS or Play app unless F-068's release check says that storefront allows it.
