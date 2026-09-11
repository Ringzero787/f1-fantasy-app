#!/usr/bin/env bash
# firebase deploy from the Linux build box, for aidlc op deploy kinds.
#
# firebase-tools analyses functions by loading them, which calls
# admin.initializeApp() and reads Application Default Credentials from the
# well-known ADC file — it ignores GOOGLE_APPLICATION_CREDENTIALS. That file
# is a broken refresh token on this box, so a service-account key is swapped
# in for the length of the deploy and the original is always restored.
#
# Usage: scripts/ops/firebase-deploy.sh --only <targets> --project <id> [firebase deploy flags…]
# Run from the directory whose firebase.json owns the targets (newgame/ for
# the tracklimits functions codebase, the repo root for everything else).
set -euo pipefail

SA_KEY="${SA_KEY:-/mnt/smb/f1-app/files/f1-app-18077-firebase-adminsdk-fbsvc-2b824e0c37.json}"
ADC="$HOME/.config/gcloud/application_default_credentials.json"

[ -r "$SA_KEY" ] || { echo "service-account key not readable: $SA_KEY (set SA_KEY)" >&2; exit 2; }
mkdir -p "$(dirname "$ADC")"
if [ -f "$ADC" ]; then
  cp "$ADC" "$ADC.aidlc-bak"
  trap 'mv -f "$ADC.aidlc-bak" "$ADC"' EXIT
else
  trap 'rm -f "$ADC"' EXIT
fi
cp "$SA_KEY" "$ADC"

firebase deploy --non-interactive "$@"
