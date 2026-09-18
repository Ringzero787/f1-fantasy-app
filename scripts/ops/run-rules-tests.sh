#!/usr/bin/env bash
# Firestore rules tests (F-056): start the Firestore emulator, run rules-tests/, stop it.
#
# `firebase emulators:exec` needs JDK 21; the build box has JDK 17, which the
# emulator jar itself runs on happily, so this starts the cached jar directly
# and falls back to the firebase CLI only when no jar has been downloaded yet
# (`firebase setup:emulators:firestore`).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

JAR="$(ls "$HOME"/.cache/firebase/emulators/cloud-firestore-emulator-*.jar 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$JAR" ]; then
  exec firebase emulators:exec --only firestore --project demo-uc-rules "node --test rules-tests/*.test.js"
fi

PORT="${RULES_EMULATOR_PORT:-8791}"
LOG="$(mktemp)"
java -jar "$JAR" --port "$PORT" --host 127.0.0.1 >"$LOG" 2>&1 &
EMU=$!
trap 'kill "$EMU" 2>/dev/null || true; rm -f "$LOG"' EXIT

for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then break; fi
  if ! kill -0 "$EMU" 2>/dev/null; then echo "Firestore emulator exited early:" >&2; cat "$LOG" >&2; exit 1; fi
  sleep 0.5
done

FIRESTORE_EMULATOR_HOST="127.0.0.1:$PORT" node --test rules-tests/*.test.js
