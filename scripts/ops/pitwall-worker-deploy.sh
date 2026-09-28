#!/usr/bin/env bash
# Deploy the Pit Wall worker to its own checkout on forge and (re)start its systemd unit (F-069).
#
#   scripts/ops/pitwall-worker-deploy.sh dryrun   # build + test, show what would change
#   scripts/ops/pitwall-worker-deploy.sh apply    # copy dist to /data/pitwall-worker/current, install unit, restart
#
# The unit runs from /data/pitwall-worker, never from this development checkout, so a branch switch
# here cannot change what production runs. SA_KEY comes from ~/.config/aidlc/env as for every op.
set -euo pipefail
MODE="${1:?dryrun or apply}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST=/data/pitwall-worker
UNIT=pitwall-worker
: "${SA_KEY:?set SA_KEY (e.g. in ~/.config/aidlc/env)}"
cd "$ROOT/workers/pitwall"
echo "== build and test the worker"
npm run build >/dev/null
node --test test/*.test.js | tail -3
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
echo "== commit $COMMIT"
echo "== unit"
cat deploy/pitwall-worker.service
if [ -f "/etc/systemd/system/$UNIT.service" ]; then
  echo "== diff against the installed unit (empty = same)"
  diff "/etc/systemd/system/$UNIT.service" deploy/pitwall-worker.service || true
else
  echo "== unit not installed yet"
fi
echo "== what the schedule would queue right now (reads only)"
node dist/workers/pitwall/src/cli/serve.js --plan
echo "== installed worker: $(cat "$DEST/current/COMMIT" 2>/dev/null || echo none) → $COMMIT"
if [ "$MODE" != "apply" ]; then echo "== dry run only: nothing was deployed"; exit 0; fi
echo "== apply"
mkdir -p "$DEST/releases/$COMMIT"
rsync -a --delete dist/ "$DEST/releases/$COMMIT/dist/"
echo "$COMMIT" > "$DEST/releases/$COMMIT/COMMIT"
# The release carries its own firebase-admin, pinned to the version functions/ uses, so the unit
# never resolves modules out of a development checkout.
( cd "$DEST/releases/$COMMIT" && { [ -f package.json ] || echo '{"name":"pitwall-worker-release","private":true}' > package.json; } && npm install --no-audit --no-fund --omit=dev --silent "firebase-admin@^12.0.0" )
# The key is copied next to the release with tight permissions, so the unit needs nothing from a home directory.
install -m 600 "$SA_KEY" "$DEST/sa.json"
# the env file: the key path and the runner name; alert settings (RESEND_API_KEY, ALERT_TO) are added by hand if wanted
if [ ! -f "$DEST/env" ]; then
  { echo "SA_KEY=$DEST/sa.json"; echo "PW_RUNNER=forge"; } > "$DEST/env"
  chmod 600 "$DEST/env"
fi
# The outlooks run through the Claude Code CLI on this machine (F-071), so there is no key to hold.
# systemd's PATH does not include ~/.local/bin, so the binary is named outright.
CLAUDE_BIN="$(command -v claude || true)"
[ -n "$CLAUDE_BIN" ] || echo "== warning: claude is not on PATH; outlooks will not run until PW_CLAUDE_BIN is set in $DEST/env"
set_env() { grep -q "^$1=" "$DEST/env" && sed -i "s#^$1=.*#$1=$2#" "$DEST/env" || echo "$1=$2" >> "$DEST/env"; }
[ -n "$CLAUDE_BIN" ] && set_env PW_CLAUDE_BIN "$(readlink -f "$CLAUDE_BIN")"
# The env file holds a session path and, for anyone who chooses PW_LLM=api, a key: keep it to the owner.
chmod 600 "$DEST/env"
set_env PW_ADMIN_MODULES "$DEST/current/node_modules"
grep -q '^PW_COMMIT=' "$DEST/env" && sed -i "s/^PW_COMMIT=.*/PW_COMMIT=$COMMIT/" "$DEST/env" || echo "PW_COMMIT=$COMMIT" >> "$DEST/env"
ln -sfn "$DEST/releases/$COMMIT" "$DEST/current"
sudo -n cp deploy/pitwall-worker.service "/etc/systemd/system/$UNIT.service"
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now "$UNIT" >/dev/null
sudo -n systemctl restart "$UNIT"
sleep 8
sudo -n systemctl --no-pager --lines=8 status "$UNIT" || true
echo "== deployed $COMMIT"
