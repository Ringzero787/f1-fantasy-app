# Session brief for the main Claude session

Written 2026-09-19 by the session that did the Undercut monetization review, designed Undercut Pit Wall and opened PR #69. It carries everything that session learned so you can continue without its context. Everything is about **Undercut** (repo root). Nothing here touches `newgame/` (Track Limits).

Read in this order: this file, `README.md` (build order, owner actions, do-nots), `ARCHITECTURE.md`, the two ADRs in `.aidlc/decisions/`, then open `prototype.html` in a browser. `RESEARCH.md` is background.

---

## 1. Where things stand

| Thing | State |
|---|---|
| PR | **#69** `chore/aidlc-league-pro-feature-set` into `master`. Plans only: registry, specs, roadmap, ADRs, docs, prototype. CI green and mergeable when last checked. **Not merged.** |
| Worktree | The branch is checked out in a separate worktree, `/data/f1-app-league-pro`, so the shared `/data/f1-app` checkout was never disturbed. After the PR merges: `git worktree remove /data/f1-app-league-pro`. |
| Backup branch | Local only: `backup/league-pro-pitwall-pre-rebase` (the granular pre-rebase history). Delete once #69 is merged. |
| Registry | League Pro **F-060 to F-066** (milestone M-08). Pit Wall **F-068 to F-075** (milestone M-09). `next_id` is 76. **F-067 is not ours**: another session registered it on master for the app icon while this branch was open, so the portal shell was renumbered to F-075. |
| Spec gate | None of the 15 specs has been through G02. Run it as each feature branch opens and expect revisions. |
| Code | No app, functions, rules or web code has been written. |
| Prototype | `docs/design/pitwall/prototype.html`, also published as a private artifact: https://claude.ai/artifact/RSAkpF64ZNvjPpT7BN2oKW (version 4). Checked in a headless browser in dark mode at 1440x900: no script errors, tallest page 1.7 screens. **Light mode and phone width were never checked.** |
| Owner's email | `openf1-permission-request.md` is a draft the owner will send himself. Do not send it. |
| Production | Only one thing touched production: a **read-only** count of the `purchases` and `leagues` collections. No writes, no deploys, no ops. |

## 2. Analysis and evidence

### 2.1 The business starting point
- About 60 users, 11 push tokens, 13 leagues, two leagues with more than one member (10 and 4), and 37 of 40 teams on auto-fill at the round 16 audit (2026-09-13). At this size no pricing model earns money; distribution and engagement come first. This shaped every recommendation: keep play free, charge the organiser and the super fan, and make the invite loop stronger.
- The three existing products (`league.expansion` $4.99 for +20 members, `avatar.pack` $1.99, `league.slot` $2.99 for an extra league) all put the paywall on growth. The free cap is 22 members and the largest league has 10, so nobody reaches the expansion paywall, and charging to create a league taxes the person recruiting users.

### 2.2 Undercut has never taken a payment (verified)
- Production `purchases` collection: **0 documents**. All 13 leagues have `maxMembers` 20 or 22, so no expansion was ever applied. Read-only script, run as `NODE_PATH=/data/f1-app/functions/node_modules node <script>` with `admin.initializeApp({ projectId: 'f1-app-18077' })`.
- `react-native-iap` was added in `aefadb0` and **removed from `package.json` in `3ad87b6`** (v2.1.0, the Amazon-support release; `git log -S'react-native-iap' -- package.json`). It is not in `node_modules` and no other purchase library replaced it.
- `src/store/purchase.store.ts` lazy-`require`s the library inside try/catch, so its absence never breaks a build; users who tap Buy get "In-app purchases are not available right now".
- The most recent Play bundle found on the share, `undercut-2.1.3-google.aab`, has zero references to `com/android/billingclient` and no `BILLING` permission. Later bundles were not located, but `package.json` has the same gap on current master.
- The server half exists: `functions/src/purchases/validatePurchase.ts` (Apple `verifyReceipt`, which is deprecated, and the Play Developer API). It has never validated a real receipt.
- **The owner believes IAP is set up.** He is right about the code and the server function, and was told twice, with this evidence, that the native library is missing. Be respectful and specific if it comes up again. Re-enabling it is small: reinstall for Play and iOS builds only (the Amazon APK must contain no Play Billing), create the product in both consoles, sandbox purchase on each store, move iOS validation to the App Store Server API, and acknowledge or consume on Android server-side so Play does not auto-refund after three days.

### 2.3 Why not a paid app or a universal charge
Google Play does not allow a published free app to become paid (it would need a new package and lose installs, reviews and ranking). Apple allows it, but paid fantasy apps do not exist for a reason: the game is worthless alone and every non-payer is a league-mate the payers cannot invite. The owner floated charging everyone and accepted this reasoning.

### 2.4 Store and payment implications
- Store cut: 15% on Play for the first $1M per year; 15% on Apple only if enrolled in the Small Business Program, otherwise 30%. Stripe on the web is about 2.9% + 30c.
- Amazon accepts neither Play nor Apple billing. Decision: no Amazon IAP; the Amazon build hides purchase and honours entitlements bought elsewhere, and the web checkout gives Amazon users a way to pay.
- Entitlements live in Firestore, so a purchase on one platform shows on all. That is allowed. Steering iOS or Play users to pay elsewhere from inside the app is restricted and varies by storefront, which is why the in-app upgrade surface has a per-platform `mode` (`iap`, `open`, `off`) in remote config, defaulting to `open` with no price or purchase wording.
- Real-money contests, sweepstakes currency and selling points or budget were ruled out (licensing, and it would destroy league trust).

### 2.5 Data licensing
OpenF1, the current ingest source (`functions/src/ingestion/openf1Client.ts`), is for non-commercial use and asks commercial users to get in touch (verified on their site). formula1.com content, including the RSS feed `fetchNews.ts` reads, is personal non-commercial use. The owner chose: **paid features use only our own game data and race results; every timing-derived frame is free only** (ADR-001). Residual risk recorded there: free timing frames still sit inside a product that promotes a paid upgrade, and today's free scoring also depends on OpenF1. The email asks about both. If the answer is no, a config switch hides the frames; if scoring is affected, the fallback is another race-results source, a change confined to `functions/src/ingestion/`.

### 2.6 Existing infrastructure facts worth knowing
- Firebase project `f1-app-18077`, shared by Undercut and Track Limits (`tl_*` collections in the same rules file). Functions are Node 22, `firebase-functions` v5, mostly v1-style `functions.https.onCall` with some v2.
- Team callables the web must use for lineup saves: `addDriverSecure`, `removeDriverSecure`, `setConstructorSecure`, `removeConstructorSecure`, `buildTeamSecure`, `quoteSaleSecure` (`functions/src/teams/teamOperations.ts`); locks in `functions/src/locks/teamLocks.ts`.
- App Check is only warned about, not enforced (`functions/src/utils/appCheck.ts`), so a new web client works before it is tightened.
- Custom tokens are already minted for Amazon sign-in (`signInWithAmazon`), so the app-to-web handoff needs no new IAM.
- Remote config: `config/app` read by `src/services/remoteConfig.service.ts`, fail-open, already drives `AppUpdateGate`. The Pit Wall entry and promotion block extends it.
- Profile screen: `src/simple/grid/GridProfileScreen.tsx` uses a `LinkRow` component; the LEAGUE row already uses the red `accent` treatment the PIT WALL row should copy. `expo-web-browser` and `expo-linking` are installed.
- News today: `functions/src/news/fetchNews.ts`, two RSS feeds, Gemini 2.0 Flash summaries into `articles`, every 30 minutes.
- Design system: `docs/design/grid/TRANSITION.md` section 3. Dark: background `#050505`, surface `#0E0E0E`, card `#1A1A1A`, one accent `#FF2E2E`, positive `#4ADE80`; light is a straight inversion. Unbounded plus JetBrains Mono. Radii 18/14/12/999, 1px borders, no gradients or shadows, team colours only as small bars.
- forge is this machine (hostname `forge`): 32 cores, 62 GB, RTX 3080 Ti. The studio already runs another product's workers here as pull-based systemd services with a GCP backup. That product's notes record a hard lesson: a service that runs from a working tree deploys whatever branch is checked out. Hence the dedicated deploy checkout in ADR-002.
- humannpc.com is on Cloudflare (the website repo deploys through Cloudflare Pages; `/data/cloudflared` exists). The owner wrote "cloudfront"; this was read as Cloudflare and he was told so. Confirm if it matters.

### 2.7 Things from the existing roadmap that matter here
The roadmap on master already had M-03 (correctness and safety, 2.4.0), M-04 (observability, 2.5.0) and M-05 (economy polish, 2.6.0). M-08 and M-09 were added without weighing them against those. Two links found afterwards:
- **F-029 per-race roster and ace snapshots (M-05) is a real dependency.** Teams store no per-race history today (`pointsHistory` is empty; only `members.lastRacePoints`). Hindsight, decision-quality tracking and the F-062 backfill cannot be exact for past rounds without it. Build it beside F-062.
- The M-03 scoring-correctness items should land before anyone is charged.
- Another session was building F-059 (server-owned league counts, scoped team reads). F-061 depends on its server-side `maxMembers` change.

## 3. Decisions made by the owner (do not re-litigate)

1. The game stays free on all three stores. No universal paywall.
2. **One product: Pit Wall Pass, $14.99 per season, per user** (`pitwall.pass.season`). Includes the full portal and League Pro. No monthly price. (ADR-001)
3. League Pro is derived, never bought: a league is Pro while its owner holds a pass; members get the Pro league features free. *This mechanism was this session's proposal to make "one product" work; the owner has not objected but has not explicitly confirmed it either. Raise it once when F-060 starts.*
4. Free look: Briefing headlines, top-10 median projections, Wire headlines, **Rate My Team**, manual lineup editing and saving on the web, and all timing frames. *The manual-editing-is-free line was also this session's call, same caveat.*
5. Paid features never use timing data; timing frames are never paid. (ADR-001)
6. Stripe first (testable in the beta), store IAP with the February 2027 app release. The owner is fine with either channel.
7. The name is Undercut Pit Wall.
8. Launch February 2027. **The owner wants to test between now and then**: beta through a config allowlist with his two leagues and complimentary passes.
9. `pitwall.humannpc.com` on Cloudflare; forge for compute, usable platform-wide; GCP as backup. (ADR-002)
10. Competitiveness is never sold. No odds, no wagering language.

## 4. Product design the owner has seen and approved

He said "love the site" about prototype version 1 and then asked for three changes, all made:
- **Briefing:** a clickable Recommendations list above the lower tiles; each item compares the current pick with the recommended or nearest-priced alternative across the page's data, marks the better value per row, gives a reason, and can carry the swap into the Lineup Lab. Hold and keep items are shown too.
- **Lineup Lab:** tapping a tile shows the **top pick** to replace that driver as a side-by-side comparison, then a table of every affordable option with stats, current pick pinned first.
- **Briefing:** Top Moves replaced by **Rivals' likely moves** (best affordable swap per rival, likelihood weighted by how often that manager edits, tagged THREAT, COPIES YOU or LOW RISK).

His hard requirements, in his words: Undercut colours; only this sport; for the super fan who will not follow every outlet; updated daily from news and the data API; driver past, present and future with the future estimated by an LLM; lineup recommendations and editing the lineup in the browser; modelled on betting-platform report frames; "comprehensive and extensive"; **no page scrolls more than three pages down, and data adapts on click-ins.**

## 5. What is not solid yet

1. **Nothing is effort-sized.** "First beta for the United States round, late October 2026" is a target this session set, not a derived schedule.
2. **The projection model is unproven.** About 16 scored races may not be enough to beat a last-3-races average. If it cannot, the paid value weakens. Test it early and cheaply before building UI around it.
3. Inputs that do not exist: a circuit-characteristics table (compile by hand), the news source allow-list, per-race roster history (F-029).
4. The custom-claim gating, the handoff flow, the job lease and the forge deploy checkout are designs, not tested code.
5. Web checkout brings tax and store-policy review that is the owner's, not a build task.
6. Prototype never checked in light mode or at phone width.

## 6. Instructions

### Step 0: orient
```
cd /data/f1-app && git fetch && git status -sb
gh pr view 69 --json state,mergeable,statusCheckRollup
grep -n next_id .aidlc/features.yaml
```
A second session shares `/data/f1-app`. Commit often, never `git add -A` (many untracked scratch files, F-033), never commit secrets, and keep each commit to one app.

### Step 1: land the plans
- Ask the owner to merge #69 (or merge it if he has said to). If master has moved, rebase; **if `features.yaml` conflicts, keep both sides, keep IDs unique, set `next_id` to max + 1.** That is exactly what happened with F-067.
- After merge: remove the worktree and the backup branch (section 1).
- Lesson for long-lived registry branches: `git fetch` and check `next_id` before registering anything.

### Step 2: build, one feature per branch
Follow the AIDLC flow in `CLAUDE.md`: `aidlc feature status <id> building`, branch `feat/F-###-slug`, Conventional Commits, spec gate, PR. Order:

1. **F-062** race winners and per-race leaderboard (free; app and functions), together with **F-029** roster snapshots. Needs nothing from the owner.
2. **Worker skeleton, then F-070.** `workers/pitwall/` (Node 22, TypeScript, imports `functions/src/scoring/scoringCore.ts`), `pw_jobs` with transactional leases, run records in `pw_runs`. Get the backtest report first: mean absolute error, floor/ceiling calibration (target 65 to 75% inside the band), price-direction accuracy, against the last-3-races baseline. **Stop and tell the owner the result before building anything that depends on it.** Until the owner has set up forge (service account, env file, systemd unit), run the worker by hand from a scratch checkout against read-only data and write nothing to production.
3. **F-075** shell on Cloudflare Pages: app skeleton, Grid tokens, eight pages, slide-over, context bar, sign-in, handoff callables, and the Playwright scroll-budget test at 1440x900 and 390x844. Reuse the prototype's layout and logic (`recs`, `briefRecs`, `cmp`, `rivalMove`, the swap pool); do not ship the prototype file.
4. **F-073** plus the Briefing frames of F-072: Rate My Team, recommendations, rivals, top pick, what-if, save through the existing callables.
5. **F-068**: Stripe in test mode, `grantPass`, `users/{uid}.pass` and the `pw` claim, rules gating with rules tests, beta allowlist, grant op. Then the in-app Profile row, upgrade sheet and teasers, all from `config/app.pitwall`.
6. Open the beta to the owner's leagues. Then Market and Season (F-074), the wire (F-071), the free timing frames (F-069 and the rest of F-072), League Pro features (F-063 to F-066), and IAP (F-060, F-061) for the February release.

### Step 3: production discipline
Every deploy, rules change, config change, backfill or grant goes through `aidlc op` (`new`, `dryrun`, show the owner the output, `apply`). New op kinds to add when first needed: `pitwall-pages-deploy`, `pitwall-worker-deploy`, and an admin grant/revoke script under `uc-script`. Functions for the portal deploy as `--only functions:pw`. Backups and logs go to `/mnt/smb/f1-app/aidlc-ops`, never into this public repo.

### Things only the owner can do (chase these early; several have lead time)
Send the OpenF1 email and paste the reply into ADR-001; Cloudflare Pages project, custom domain and a scoped API token; Firebase Web app registration and authorized domain; Stripe account (test mode is enough for the beta), later Stripe Tax; forge service account key, `/etc/pitwall-worker.env`, systemd unit and timers; GCP services for the backup runner (can wait); store products, Apple paid-apps agreement and banking, Google payments profile, Play service-account order permissions; LLM API key with a budget alert; terms and privacy updates for web payments.

### Verification recipes that worked
- Headless check of any static page or the prototype: a Playwright script run with `NODE_PATH=/data/nataliesfarm/node_modules node shot.js` (Chromium is in `~/.cache/ms-playwright`; the repo's own `node_modules` has no Playwright). Opening a bare HTML file with no doctype renders tables in quirks mode with larger text; the published page does not.
- Page height check used for the scroll budget: `document.documentElement.scrollHeight / innerHeight` after each tab click.

## 7. Open questions to put to the owner when they become relevant
1. Confirm League Pro is derived from the league owner's pass (decision 3) and that manual lineup editing on the web is free (decision 4).
2. "cloudfront" means Cloudflare?
3. Which LLM for briefings. The app uses Gemini for news today; the spec puts the provider behind an interface with Claude as default and an optional local model on forge for tagging.
4. Whether to become an OpenF1 Sponsor now (EUR 9.90 per month, goodwill and live data, not a licence).
5. Whether M-03 correctness work goes ahead of the portal, given that charging starts in February.
