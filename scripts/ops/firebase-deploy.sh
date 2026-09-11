#!/usr/bin/env bash
# firebase deploy from the Linux build box, for aidlc op deploy kinds.
#
# firebase-tools analyses functions by loading them, which calls
# admin.initializeApp() and reads Application Default Credentials from the
# well-known ADC file — it ignores GOOGLE_APPLICATION_CREDENTIALS. So the
# service-account key is placed there (owner-only) for the deploy, and whatever
# was there before is put back afterwards, also on Ctrl-C or a kill signal.
#
# SA_KEY: path to the service-account key. Set it in ~/.config/aidlc/env (the
# aidlc wrapper loads it); it is deliberately not written in this public repo.
#
# Usage: scripts/ops/firebase-deploy.sh --only <targets> --project <id> [firebase deploy flags…]
# Run from the directory whose firebase.json owns the targets (newgame/ for the
# tracklimits functions codebase, the repo root for everything else).
set -euo pipefail
umask 077

: "${SA_KEY:?set SA_KEY to the service-account key file (e.g. in ~/.config/aidlc/env)}"
[ -r "$SA_KEY" ] || { echo "service-account key not readable: $SA_KEY" >&2; exit 2; }

ADC="$HOME/.config/gcloud/application_default_credentials.json"
BAK="$ADC.aidlc-bak"
if [ -e "$BAK" ]; then
  echo "$BAK exists: an earlier deploy did not restore the ADC file. Put the right file back at $ADC, delete $BAK, then retry." >&2
  exit 2
fi
if [ -L "$ADC" ]; then
  echo "$ADC is a symlink; refusing to write the service-account key through it." >&2
  exit 2
fi
mkdir -p "$(dirname "$ADC")"
had_adc=0
if [ -f "$ADC" ]; then cp -p "$ADC" "$BAK"; had_adc=1; fi
restore() { if [ "$had_adc" = 1 ]; then mv -f "$BAK" "$ADC"; else rm -f "$ADC"; fi; }
trap restore EXIT
trap 'exit 130' INT TERM HUP
install -m 600 "$SA_KEY" "$ADC"

firebase deploy --non-interactive "$@"
