#!/usr/bin/env bash
# F-154: rehearse the season rollover against a copy of production in the Firestore EMULATOR, and
# check every claim the F-150 runbook makes. Nothing here can write production: every helper is
# passed --emulator=HOST:PORT (loopback only) and refuses without it, and the rollover script in
# --emulator mode never loads the service-account key.
#
# Usage: scripts/ops/rollover-rehearsal.sh <emulator HOST:PORT> <dir holding prod-copy.json and copy-paths.txt>
#   The emulator must already be running and EMPTY (start it fresh: the same pinned jar
#   scripts/ops/run-rules-tests.sh uses). The copy is a read-only firestore-backup.js of production
#   (no --emulator), taken into a 0700 folder on the ops share; F-150 "Rehearsal" lists its paths.
#
# Steps, each checked: load the copy → doctor it (season finished, hostile team fields) → dry run
# (writes the path list) → backup like the op → FULL apply → rollback (must equal the pre-apply
# digest) → apply stopped after 60 groups → re-run (must equal the full run) → a third apply refuses
# → rollback (pre-apply digest again). A log lands in <dir>/run-<time>/rehearsal.log.
set -euo pipefail
EMU="${1:?emulator HOST:PORT}"; SRC="${2:?dir with prod-copy.json}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN="$SRC/run-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -m 700 -p "$RUN"
LOG="$RUN/rehearsal.log"; exec > >(tee -a "$LOG") 2>&1
unset GOOGLE_APPLICATION_CREDENTIALS SA_KEY
export FIRESTORE_EMULATOR_HOST="$EMU"
E="--emulator=$EMU"
cd "$ROOT"
digest() { node scripts/ops/rehearsal-digest.js "$E"; }
field() { node -e "process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]]))" "$1" "$2"; }
must() { if [ "$1" != "$2" ]; then echo "FAIL: $3 (got $1, want $2)"; exit 1; fi; echo "ok: $3"; }
roll() { (cd functions && node scripts/seasonRollover.js "$E" "$@"); }

echo "== rehearsal $(date -u +%FT%TZ) · emulator $EMU · tree $(git rev-parse --short HEAD)"
npm --prefix functions run build >/dev/null
EMPTY=$(digest); must "$(field "$EMPTY" docs)" 0 "the emulator starts empty"
node scripts/ops/firestore-restore.js --from="$SRC/prod-copy.json" --only-file="$SRC/copy-paths.txt" "$E" --load-production-copy --write | tail -1
node scripts/ops/rehearsal-doctor.js "$E" --hostile-fields --write
BEFORE=$(digest); echo "BEFORE   $BEFORE"
must "$(field "$BEFORE" oddFieldTeams)" 3 "three teams carry hostile field names"

roll --paths-out="$RUN/backup-paths.txt" > "$RUN/dryrun.log"; grep -E "preconditions|atomic|sha256" "$RUN/dryrun.log"
grep -q "preconditions: met" "$RUN/dryrun.log" || { echo "FAIL: preconditions not met on the doctored copy"; exit 1; }
node scripts/ops/firestore-backup.js "$E" --out="$RUN/backup.json" --paths-file="$RUN/backup-paths.txt" | sed 's/ from .* →/ →/'
restore() { node scripts/ops/firestore-restore.js --from="$RUN/backup.json" --only-file="$RUN/backup-paths.txt" "$E" --write | tail -1; }

echo "== 1. full apply"
roll --apply --paths-check="$RUN/backup-paths.txt" > "$RUN/apply-full.log"; tail -1 "$RUN/apply-full.log"
FULL=$(digest); echo "FULL     $FULL"
must "$(field "$FULL" teamsReset)/$(field "$FULL" teamArchives)" "$(field "$BEFORE" teams)/$(field "$BEFORE" teams)" "every team archived and reset"
must "$(field "$FULL" leagueArchives)/$(field "$FULL" leaguesOn2027)" "$(field "$BEFORE" leagues)/$(field "$BEFORE" leagues)" "every league archived and reset"
must "$(field "$FULL" membersZeroed)" "$(field "$FULL" members)" "every member zeroed"
must "$(field "$FULL" priced2027)" "$(field "$FULL" entities)" "every driver and constructor priced for 2027"
must "$(field "$FULL" currentSeason)/$(field "$FULL" rolledOver)" "2027/true" "season switched"
must "$(field "$FULL" oddFieldTeams)" 0 "hostile field names cleared by the reset"

echo "== 2. rollback after a full run"
restore; R1=$(digest); must "$(field "$R1" digest)" "$(field "$BEFORE" digest)" "rollback returns the exact pre-apply state"

echo "== 3. a run that dies after 60 groups, then the re-run"
set +e; roll --apply --paths-check="$RUN/backup-paths.txt" --fail-after=60 > "$RUN/apply-stopped.log" 2>&1; rc=$?; set -e
must "$rc" 3 "the stopped run exits 3"; tail -1 "$RUN/apply-stopped.log"
MID=$(digest); echo "MID      $MID"
must "$(field "$MID" priced2027)/$(field "$MID" races2027)/$(field "$MID" currentSeason)" "$(field "$FULL" entities)/0/2026" "mid-run: prices in, no 2027 race, still 2026"
roll --apply --paths-check="$RUN/backup-paths.txt" > "$RUN/apply-rerun.log"; tail -1 "$RUN/apply-rerun.log"
RERUN=$(digest); must "$(field "$RERUN" digest)" "$(field "$FULL" digest)" "the re-run ends exactly where the full run ended"

echo "== 4. a further apply refuses"
set +e; roll --apply --paths-check="$RUN/backup-paths.txt" > "$RUN/apply-again.log" 2>&1; rc=$?; set -e
must "$rc" 1 "a run after the switch refuses"; grep -E "already rolled over" "$RUN/apply-again.log"

echo "== 5. rollback after the stopped-and-finished run"
restore; R2=$(digest); must "$(field "$R2" digest)" "$(field "$BEFORE" digest)" "rollback returns the exact pre-apply state again"
echo "== REHEARSAL PASSED · log $LOG"
