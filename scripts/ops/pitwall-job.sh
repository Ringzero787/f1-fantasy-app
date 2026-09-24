#!/usr/bin/env bash
# Run one Pit Wall worker job against production, for the `pitwall-job` aidlc op kind (F-070).
#
#   scripts/ops/pitwall-job.sh dryrun <job> [session]   # reads only, prints what it would publish
#   scripts/ops/pitwall-job.sh apply  <job> [session]   # the same run, then writes the pw_* documents
#
# Jobs: projections. SA_KEY comes from ~/.config/aidlc/env, as for every other op.
set -euo pipefail
MODE="${1:?dryrun or apply}"
JOB="${2:?job name (projections)}"
SESSION="${3:-daily}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
case "$JOB" in projections) ENTRY=project ;; *) echo "unknown job '$JOB'" >&2; exit 2 ;; esac
case "$SESSION" in [a-z0-9_]*) ;; *) echo "session must be a plain name" >&2; exit 2 ;; esac
: "${SA_KEY:?set SA_KEY (e.g. in ~/.config/aidlc/env)}"

cd "$ROOT/workers/pitwall"
echo "== build and test the worker"
npm run build >/dev/null
node --test test/*.test.js | tail -3
echo "== $MODE $JOB (session $SESSION)"
if [ "$MODE" = "apply" ]; then
  node "dist/workers/pitwall/src/cli/$ENTRY.js" --apply "--session=$SESSION"
else
  node "dist/workers/pitwall/src/cli/$ENTRY.js" "--session=$SESSION"
fi
