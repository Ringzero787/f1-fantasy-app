# Handoff: Undercut Pit Wall and League Pro

For whoever builds this next on `master` (human or Claude session). This PR adds **plans only**: registry entries, specs, a prototype and an architecture. No app, functions or rules code changes. Read this file, then `ARCHITECTURE.md`, then open `prototype.html` in a browser.

## What was decided (2026-09-18 and 19)

1. **Undercut stays free to download and play on all three stores.** No universal paywall. Two paid products sit on top:
   - **League Pro** (M-08, F-060 to F-066): the commissioner pays once per league per season (`league.pro.season`, about $14.99); every member gets the Pro features.
   - **Pit Wall Pass** (M-09, F-068 to F-075): per-user premium, a web analytics portal; about $29.99 per season or $4.99 per month, sold on the web through Stripe and as a store IAP.
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
| `docs/design/pitwall/ARCHITECTURE.md` | Hosting, identity, entitlement, data model, pipeline, in-app promotion, store policy |

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
1. F-075 shell: `web/pitwall/` (Vite, React, TypeScript), second Hosting site, op kind `pitwall-hosting-deploy`, sign-in, the app to web handoff callables, Playwright scroll-budget test. Ship behind `config/app.pitwall.enabled = false`.
2. F-070 projections v1 from `raceScores` history through `scoringCore`, plus the price model from `updatePrices` rules. The backtest gate must pass before anything is shown to users.
3. F-073 lineup lab and the Briefing recommendations and rivals frames from F-072, all computed client-side from page payloads plus the user's own readable documents. Save goes through the existing team callables only.
4. Market frames from F-074 that use our data: price model, value, ownership, team value, hindsight.

**Phase 2 — getting paid**
5. F-060 then F-061: bring in-app purchase back (Play and iOS builds only; the Amazon APK must contain no Play Billing), League Pro entitlement and upgrade screen.
6. F-068: Stripe checkout and webhook, `users/{uid}.pass` plus the `pw` claim, IAP path for the pass, free teaser gating in rules.
7. In-app surfaces from `ARCHITECTURE.md` section 8: Profile row first, then the upgrade sheet, then the two teasers. All driven by `config/app.pitwall`; change that document through an `uc-script` op, never by hand.

**Phase 3 — depth**
8. F-071 news wire and briefing. 9. F-069 timing pipeline (blocked on the licence gate). 10. The rest of F-072 (Circuit, Pace Lab) and F-074 (Season). 11. F-063 to F-066 League Pro features.

Target: portal open beta with free teaser for 2027 pre-season testing, paid from round 1 of 2027.

## In-app changes, concretely

- `src/services/remoteConfig.service.ts`: extend the `config/app` type with the optional `pitwall` block; keep it fail-open.
- `src/simple/grid/GridProfileScreen.tsx`: add a `LinkRow` under LEAGUE (`label` and value text from config; `accent` when the user has no pass). Handler: pass holders call `pw.createPortalHandoff` then `Linking.openURL`; others open the upgrade sheet.
- New `src/simple/grid/GridUpgradeSheet.tsx` following the avatar sheet pattern in the same file.
- `src/simple/grid/GridTeamPanel.tsx` and `GridWeekendRecap.tsx`: one teaser line each, capped per round.
- No change to `app/(tabs)/**` or `src/config/themes.ts` (same rule as the Grid handoff).
- Minimum app version for these surfaces is set in config (`minAppVersion`), so older builds simply show nothing.

## Owner actions (cannot be done from the repo)

- [ ] Data licence: written permission or a commercial plan from the timing data provider, or choose a licensed feed. Record the outcome in `.aidlc/decisions/`. Blocks F-069 and any paid launch that shows timing-derived frames.
- [ ] Firebase console: create Hosting site `undercut-pitwall`, register a Web app (config and App Check), add the portal domain to Auth authorized domains.
- [ ] Cloudflare: CNAME `pitwall.humannpc.com` to Firebase Hosting.
- [ ] Stripe account, products and prices, Stripe Tax; webhook secret into Secret Manager.
- [ ] Play Console and App Store Connect: create `league.pro.season` and the pass product; Apple paid-apps agreement and banking; Google payments profile; Play service account order permissions.
- [ ] LLM API key into Secret Manager with a $40 per month budget alert.
- [ ] Terms and privacy pages updated for web payments.

## Do not

- Do not sell anything that changes scoring, budget or lineups.
- Do not show bookmaker odds or use wagering language anywhere.
- Do not redistribute raw timing data or mirror live timing; serve derived aggregates.
- Do not reproduce article text; two sentences in our own words plus a link out.
- Do not put a trademark watchlist term in a product, page, tier or pack name.
- Do not let the web write `fantasyTeams`, `users/{uid}.pass` or `leagues/{id}.pro` directly.
- Do not deploy functions, rules, hosting or config outside `aidlc op`.
- Do not put purchase wording or web prices inside the iOS or Play app unless F-068's release check says that storefront allows it.
