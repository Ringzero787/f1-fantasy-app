# Undercut Pit Wall (web portal)

The premium analytics portal for Undercut (F-075 shell; plan in `docs/design/pitwall/`). Vite, React and TypeScript, served by Cloudflare Pages at `pitwall.humannpc.com`. It uses the same Firebase Auth project as the app, so a signed-in user sees their own team and league. Nothing here touches `newgame/`.

## State
- The shell is complete: context bar, eight pages, slide-over (past, present, outlook), compare tray, sign-in (email, Google, Apple) and the `/h#code` app handoff route.
- **Every analytics frame shows EXAMPLE DATA**, generated in `src/data/example.ts` and labelled with a red pill, until the projection worker publishes real payloads (F-070, F-072). The signed-in user's team name, bank, round and lock countdown are real.
- "Keep this what-if" in the Lineup Lab writes nothing. Saving to the real team arrives with F-073, through the existing server callables only.
- Not deployed. The `pw` functions (handoff) are not deployed either.

## Run
```
cp .env.example .env.local     # fill VITE_FIREBASE_* (the root .env has the same values as EXPO_PUBLIC_FIREBASE_*)
npm install
npm run dev                    # sign-in required
npm test                       # vitest: recommendation logic, lock countdown, routes, handoff fragment
npm run build:preview && PLAYWRIGHT_PATH=/data/nataliesfarm/node_modules npm run test:scroll
```
`--mode preview` builds a copy that skips sign-in and renders example data, for the scroll-budget test and design review. `import.meta.env.MODE` is inlined at build time, so a production bundle has no preview path.

## Rules this code keeps
- **Scroll budget:** no page may exceed three viewport heights at 1440x900 or 390x844, in any click-in state. `tests/scroll-budget.mjs` measures every page, every in-card tab and chip, and both Lineup Lab slot states, in dark and light, and fails on sideways overflow. Depth goes into the slide-over, never into page length.
- **Per-user views are computed in the browser** (`src/data/logic.ts`) from a page payload plus the user's lineup. Pure and unit-tested.
- **Timing-derived frames are free** and never sit behind the pass (ADR-001). Pace Lab is marked as such.
- **The web never writes `fantasyTeams`.** Lineup saves will replay the diff through the existing team callables.
- Colour is never the only encoding: direction uses glyphs and signs, charts have a tooltip and a "Show as table" view, and rows are real buttons for the keyboard.
- No bookmaker odds, no wagering words, no watchlist term in a page or product name. The footer and sign-in carry the unofficial notice.

## Deploy
Only through `aidlc op` (kind `pitwall-pages-deploy`, script `scripts/ops/pitwall-pages-deploy.sh`). The dry run installs, runs the unit tests and the scroll budget, makes the production build, checks the first-load budget (250 KB gzip) and lists the files. Apply repeats the checks and runs `wrangler pages deploy dist --project-name <project> --branch main`. Before the first deploy the owner needs: the Pages project and the `pitwall.humannpc.com` custom domain in Cloudflare, that domain in Firebase Auth's authorized domains, and the `pw` functions and rules deployed (functions-deploy and rules-deploy ops).
