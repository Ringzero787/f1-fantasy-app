# Undercut Pit Wall (web portal)

The premium analytics portal for Undercut (F-075 shell; plan in `docs/design/pitwall/`). Vite, React and TypeScript, served by Cloudflare Pages at `pitwall.humannpc.com`. It uses the same Firebase Auth project as the app, so a signed-in user sees their own team and league.

## State
Deployed to Cloudflare Pages through the `pitwall-pages-deploy` op, and fed by the worker in `workers/pitwall`, which publishes the payloads the pages read. The example payload in `src/data/example.ts` now serves only the `preview` build (design review and the scroll-budget test). A signed-in reader is never shown it; in production only the example lineup stands in, for a signed-in user who has no team.

Content is open to every signed-in user for now. Closing it again takes three changes, and the first is the real gate: restore `hasPass()` on the `pw_pages`, `pw_entities` and `pw_projections` reads in `firestore.rules` and deploy the rules; flip the mirror constant in the app (`src/pitwall/gates.ts`), which needs an app build; and flip `PITWALL_CONTENT_OPEN` in `src/data/access.ts`, a build-time constant, with a portal deploy. Hiding the pages alone leaves the paid data readable. What is built and what is open is in the registry, not here.

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
Only through `aidlc op` (kind `pitwall-pages-deploy`, script `scripts/ops/pitwall-pages-deploy.sh`). The dry run needs `PLAYWRIGHT_PATH` (a node_modules folder with Playwright; set it in `~/.config/aidlc/env`). It installs, runs the unit tests and the scroll budget, makes the production build, checks the first-load budget (250 KB gzip) and lists the files. Apply repeats the checks and runs `wrangler pages deploy dist --project-name <project> --branch main`. Before the first deploy the owner needs: the Pages project and the `pitwall.humannpc.com` custom domain in Cloudflare, that domain in Firebase Auth's authorized domains, and the `pw` functions and rules deployed (functions-deploy and rules-deploy ops).
