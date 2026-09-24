#!/usr/bin/env bash
# Delete deployed Cloud Functions by name, for the `functions-delete` aidlc op kind.
#
# Why this exists: firebase refuses to change a deployed function from 1st to 2nd Gen in place
# ("Upgrading from 1st Gen to 2nd Gen is not yet supported"). The documented path is to delete the
# old function and let the next deploy create it again at the new generation. Nothing else should
# use this kind — a function deleted without an immediate redeploy is an outage.
#
# Unlike a deploy, this never loads the functions source, so the service-account key can be passed
# through GOOGLE_APPLICATION_CREDENTIALS and the ADC file is left alone.
#
#   scripts/ops/firebase-functions-delete.sh dryrun <names> <region> <project>
#   scripts/ops/firebase-functions-delete.sh apply  <names> <region> <project>
#
# names: comma-separated deployed names, e.g. pw-createPortalHandoff,pw-redeemPortalHandoff
set -euo pipefail
MODE="${1:?dryrun or apply}"
NAMES="${2:?comma-separated function names}"
REGION="${3:?region, e.g. us-central1}"
PROJECT="${4:?firebase project id}"
: "${SA_KEY:?set SA_KEY to the service-account key file (e.g. in ~/.config/aidlc/env)}"
[ -r "$SA_KEY" ] || { echo "service-account key not readable: $SA_KEY" >&2; exit 2; }
export GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY"

case "$NAMES" in *[!a-zA-Z0-9,_-]*) echo "names must be plain function names separated by commas" >&2; exit 2 ;; esac
IFS=',' read -r -a LIST <<< "$NAMES"
[ "${#LIST[@]}" -gt 0 ] || { echo "no names given" >&2; exit 2; }

echo "== deployed functions in $PROJECT"
firebase functions:list --project "$PROJECT" | tee /tmp/.ffl.$$ || true
echo
for n in "${LIST[@]}"; do
  if grep -q "[[:space:]]$n[[:space:]]" /tmp/.ffl.$$; then
    echo "would delete: $n ($REGION)"
  else
    echo "NOT DEPLOYED (nothing to delete): $n"
  fi
done
rm -f /tmp/.ffl.$$

if [ "$MODE" != "apply" ]; then
  echo
  echo "== dry run only: nothing was deleted"
  exit 0
fi

echo
echo "== deleting ${#LIST[@]} function(s); the redeploy that recreates them must follow immediately"
firebase functions:delete "${LIST[@]}" --region "$REGION" --project "$PROJECT" --force
