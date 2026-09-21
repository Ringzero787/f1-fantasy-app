#!/usr/bin/env bash
# Undercut Pit Wall -> Cloudflare Pages, for the `pitwall-pages-deploy` aidlc op kind (F-075, ADR-002).
#
#   scripts/ops/pitwall-pages-deploy.sh dryrun            # test, build, check budgets, list what would ship
#   scripts/ops/pitwall-pages-deploy.sh apply <project>   # the same checks, then wrangler pages deploy
#
# The Firebase WEB config (public identifiers, not secrets) comes from VITE_FIREBASE_* if set, otherwise
# from the repository root .env the Undercut app already uses (EXPO_PUBLIC_FIREBASE_*).
# wrangler uses CLOUDFLARE_API_TOKEN when set (~/.config/aidlc/env), otherwise the operator's own login.
# PLAYWRIGHT_PATH must point at a node_modules folder that contains playwright (scroll-budget gate).
set -euo pipefail
MODE="${1:?dryrun or apply}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/web/pitwall"
BUDGET_KB=250

if [ -f "$ROOT/.env" ]; then
  for k in API_KEY AUTH_DOMAIN PROJECT_ID STORAGE_BUCKET MESSAGING_SENDER_ID APP_ID; do
    v="VITE_FIREBASE_$k"
    if [ -z "${!v:-}" ]; then
      val="$(grep -E "^EXPO_PUBLIC_FIREBASE_$k=" "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'\r' || true)"
      if [ -n "$val" ]; then export "$v=$val"; fi
    fi
  done
fi
: "${VITE_FIREBASE_API_KEY:?no Firebase web config: set VITE_FIREBASE_* or EXPO_PUBLIC_FIREBASE_* in the root .env}"
[ "${VITE_FIREBASE_PROJECT_ID:-}" = "f1-app-18077" ] || { echo "refusing: Firebase project is '${VITE_FIREBASE_PROJECT_ID:-}', expected f1-app-18077" >&2; exit 2; }

cd "$APP"
echo "== install"; npm ci --no-audit --no-fund >/dev/null
echo "== unit tests"; npx vitest run
echo "== scroll budget (preview build: example data, no sign-in)"
npx tsc -p . --noEmit && npx vite build --mode preview >/dev/null
# Playwright is not a dependency of the portal. Point PLAYWRIGHT_PATH at a node_modules folder that has it
# (set it in ~/.config/aidlc/env, which the aidlc wrapper loads). Without it nothing can be deployed.
: "${PLAYWRIGHT_PATH:?set PLAYWRIGHT_PATH to a node_modules folder containing playwright (e.g. in ~/.config/aidlc/env)}"
node tests/scroll-budget.mjs | tail -22
echo "== production build"
rm -rf dist && npx vite build | tail -8
grep -q 'assets/' dist/index.html || { echo "build produced no assets" >&2; exit 3; }

# first load = the entry script plus everything index.html preloads
first=0
for f in $(grep -oE '(src|href)="/assets/[^"]+\.js"' dist/index.html | grep -oE '/assets/[^"]+'); do
  first=$(( first + $(gzip -c "dist$f" | wc -c) ))
done
echo "first-load JS: $(( first / 1024 )) KB gzip (budget ${BUDGET_KB} KB)"
[ $(( first / 1024 )) -le "$BUDGET_KB" ] || { echo "over the first-load budget" >&2; exit 4; }
[ -f dist/_headers ] && [ -f dist/_redirects ] || { echo "_headers or _redirects missing from dist" >&2; exit 5; }
echo "== files that would ship"; (cd dist && find . -type f | sort | while read -r f; do printf '  %8s  %s\n' "$(wc -c < "$f")" "$f"; done)

if [ "$MODE" = "apply" ]; then
  PROJECT="${2:?Cloudflare Pages project name}"
  echo "== deploying to Cloudflare Pages project $PROJECT (branch main)"
  npx --yes wrangler@4 pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
else
  echo "== dry run only: nothing was deployed"
fi
