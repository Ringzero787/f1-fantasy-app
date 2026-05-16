# Ben pipeline scripts

Tooling to push Ben's posted lines into Firestore (`ben_lines/{raceId}_{session}`).

## seedBenLines.ts

Reads a CSV and writes Ben's posted lines for one race.

CSV columns (header required):

```
entityId,entityKind,session,line,withOdds,againstOdds
ver,driver,race,3.5,1.91,1.91
ver,driver,qualifying,2.5,1.91,1.91
red_bull,constructor,race,12.5,1.95,1.85
...
```

`entityId` matches Firestore driver/constructor IDs (e.g. `ver`, `red_bull`).
`session` is one of `qualifying`, `race`, `sprint`. `line` is a finishing
position for drivers, sum-of-both-drivers' positions for constructors.

Run:

```
cd newgame/functions
npx ts-node scripts/seedBenLines.ts \
  --race=2026_R07_canada \
  --csv=/tmp/canada-lines.csv
```

The script uses application-default credentials. If `firebase-admin` can't
find ADC, either:

- run `gcloud auth application-default login` once, or
- set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON key path.

## Bridging from the Python predictor

`/mnt/smb/f1-app/model/predicted_scores.py` outputs predicted Q/R rank + total
points per driver, plus constructor totals. To get Ben lines from this:

1. Pick a metric (we use **finishing position**: Q rank for the qualifying
   line, R rank for the race line, sum-of-team's-driver R ranks for the
   constructor race line).
2. Round the predicted rank to the nearest half integer so pushes are
   impossible (e.g. 3.07 → 3.5, 5.62 → 5.5).
3. Set the odds (until Ben's Q3 spec lands, default 1.91/1.91 — ~4.7% hold).

A small Python wrapper around `predicted_scores.py` that emits the CSV directly
would slot in here. Until that exists, you can build the CSV by hand from the
model's printed output (see `Canadian GP 2026` example in `MODELS.md`).
