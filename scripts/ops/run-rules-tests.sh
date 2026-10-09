#!/usr/bin/env bash
# Firestore rules tests (F-056): start the Firestore emulator, run rules-tests/, stop it.
#
# `firebase emulators:exec` needs JDK 21; the build box has JDK 17, which the
# emulator jar itself runs on happily, so this starts the jar directly.
#
# It also DOWNLOADS the jar when none is cached, which is what lets this run in CI
# (F-117): a GitHub runner has no firebase CLI and no cached emulator, so the old
# fallback could not work there and the enforcement half of every rules feature —
# F-056, F-095, F-098, F-104, F-105 — was only ever checked on one machine. The
# download is pinned by version AND sha256, because an unpinned jar fetched over
# the network and executed is a supply-chain hole, not a convenience. To bump it,
# change both constants together; the sha256 is printed on mismatch.
#
# A cached jar is preferred over downloading, so the build box keeps using whatever
# the firebase CLI already put there.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# The memberCount integration test loads the compiled functions.
npm --prefix functions run build >/dev/null

EMULATOR_VERSION="v1.19.8"
EMULATOR_SHA256="9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d"
CACHE="${FIREBASE_EMULATOR_CACHE:-$HOME/.cache/firebase/emulators}"

JAR="$(ls "$CACHE"/cloud-firestore-emulator-*.jar 2>/dev/null | sort -V | tail -1 || true)"
if [ -z "$JAR" ]; then
  if ! command -v java >/dev/null 2>&1; then
    # No java at all: the CLI's own JDK handling is the only hope, and it needs 21.
    echo "No java on PATH; falling back to the firebase CLI (which needs JDK 21)." >&2
    exec firebase emulators:exec --only firestore --project demo-uc-rules "node --test rules-tests/*.test.js"
  fi
  JAR="$CACHE/cloud-firestore-emulator-$EMULATOR_VERSION.jar"
  mkdir -p "$CACHE"
  echo "Downloading the Firestore emulator $EMULATOR_VERSION (no cached jar)..." >&2
  TMP="$JAR.part.$$"
  curl -fsSL --retry 3 --retry-delay 2 \
    "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-$EMULATOR_VERSION.jar" \
    -o "$TMP" || { rm -f "$TMP"; echo "Could not download the Firestore emulator." >&2; exit 1; }
  GOT="$(sha256sum "$TMP" | cut -d' ' -f1)"
  if [ "$GOT" != "$EMULATOR_SHA256" ]; then
    rm -f "$TMP"
    echo "Firestore emulator sha256 mismatch. Refusing to run it." >&2
    echo "  expected $EMULATOR_SHA256" >&2
    echo "  got      $GOT" >&2
    echo "If this is a deliberate version bump, update EMULATOR_VERSION and EMULATOR_SHA256 together." >&2
    exit 1
  fi
  mv "$TMP" "$JAR"
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
