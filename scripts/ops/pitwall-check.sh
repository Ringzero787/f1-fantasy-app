#!/usr/bin/env bash
# The twice-weekly Pit Wall check (F-132), meant for cron:
#   3 7 * * 1,4  /data/f1-app/scripts/ops/pitwall-check.sh >> /data/scripts/pitwall-check.log 2>&1
#
# Runs scripts/ops/pitwall-check.js (reads only), files the report on the share, and when the
# Claude Code CLI is on the box asks it for a short triage of anything not OK — text only, no
# tools, so the scheduled run can never change production. Exit code is the check's.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${PW_CHECK_DIR:-/mnt/smb/share/undercut/pitwall-checks}"
ENV_FILE="${AIDLC_ENV:-$HOME/.config/aidlc/env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
: "${SA_KEY:?set SA_KEY (e.g. in ~/.config/aidlc/env)}"

mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y-%m-%d-%H%M)"
REPORT="$OUT_DIR/$STAMP.md"
node "$ROOT/scripts/ops/pitwall-check.js" > "$REPORT"
CODE=$?
echo "== pitwall-check $STAMP exit $CODE → $REPORT"
cat "$REPORT"

CLAUDE="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
if [ "$CODE" -ne 0 ] && [ -x "$CLAUDE" ] && [ "${PW_CHECK_TRIAGE:-1}" = "1" ]; then
  {
    echo
    echo "## Triage"
    echo
    # the prompt goes on stdin: --tools is variadic and would swallow a trailing argument
    printf '%s' "You are reading a Pit Wall health report for the Undercut fantasy app (repo Ringzero787/f1-fantasy-app). Pit Wall is the analytics portal fed by a worker (systemd unit pitwall-worker on this box) that publishes pw_public/pw_pages/pw_projections per round from the races registry in Firestore. In at most eight short lines, say what is wrong, the likely cause, and the first thing the owner should do (for example: restart the worker with 'sudo systemctl restart pitwall-worker'; re-run 'aidlc op new pitwall-job -p job=projections -p session=daily'; fix the races document's schedule). Do not invent facts beyond the report. Report:
$(cat "$REPORT")" | "$CLAUDE" -p --output-format text --max-turns 1 --tools "" 2>&1 | head -40
  } >> "$REPORT"
  echo "== triage appended"
fi
exit "$CODE"
