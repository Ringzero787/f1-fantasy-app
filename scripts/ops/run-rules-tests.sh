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

# The memberCount integration test loads the compiled functions.
npm --prefix functions run build >/dev/null

JAR="$(ls "$HOME"/.cache/firebase/emulators/cloud-firestore-emulator-*.jar 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$JAR" ]; then
  exec firebase emulators:exec --only firestore --project demo-uc-rules "node --test rules-tests/*.test.js"
fi

# A free port, chosen by the kernel (other services on the build box hold fixed ports).
PORT="${RULES_EMULATOR_PORT:-$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}"
LOG="$(mktemp)"
java -jar "$JAR" --port "$PORT" --host 127.0.0.1 >"$LOG" 2>&1 &
EMU=$!
trap 'kill "$EMU" 2>/dev/null || true; rm -f "$LOG"' EXIT

# Ready means OUR emulator answers: the process is alive and the emulator-only endpoint works.
READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$EMU" 2>/dev/null; then echo "Firestore emulator exited early:" >&2; cat "$LOG" >&2; exit 1; fi
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "http://127.0.0.1:$PORT/emulator/v1/projects/demo-uc-ready/databases/(default)/documents" || true)"
  if [ "$CODE" = 200 ]; then READY=1; break; fi
  sleep 0.5
done
[ "$READY" = 1 ] || { echo "Firestore emulator did not become ready on port $PORT" >&2; cat "$LOG" >&2; exit 1; }

FIRESTORE_EMULATOR_HOST="127.0.0.1:$PORT" node --test rules-tests/*.test.js
