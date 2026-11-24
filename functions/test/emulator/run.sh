#!/bin/sh
# F-171: run the emulator tests (test/emulator/*.emu.test.js) against a throwaway Firestore emulator.
# `demo-f171` is a demo- project id: the emulator runs fully offline and nothing can reach a real
# project. Ports are in the repo root firebase.json (emulators block).
# firebase-tools 15 needs Java 21+; if the default `java` is older, use an installed 21+ JDK.
set -e
cd "$(dirname "$0")/../.."
major() { "$1" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1; }
v=$(major java 2>/dev/null); if [ "${v:-0}" -lt 21 ]; then
  for j in "$JAVA_HOME" /usr/lib/jvm/java-2[1-9]-* /usr/lib/jvm/java-1.2[1-9]*; do
    if [ -x "$j/bin/java" ] && [ "$(major "$j/bin/java")" -ge 21 ]; then PATH="$j/bin:$PATH"; export PATH; JAVA_HOME="$j"; export JAVA_HOME; break; fi
  done
fi
v=$(major java 2>/dev/null); [ "${v:-0}" -ge 21 ] || { echo "F-171: firebase emulators:exec needs Java 21+ (found ${v:-none}); install a JDK 21 or set JAVA_HOME" >&2; exit 2; }
exec firebase emulators:exec --only firestore --project demo-f171 "node --test --test-concurrency=1 'test/emulator/*.emu.test.js'"
