# workers/

Compute that is too heavy or too long-running for Cloud Functions runs here, on forge first with a GCP backup (`.aidlc/decisions/ADR-002-pit-wall-infrastructure.md`). `pitwall/` is the first worker. The conventions below are meant to be reused by the next one.

## Conventions
- **Jobs are leased, never pushed.** Work is a document in a queue collection (`pw_jobs`). A runner claims one in a transaction, renews the lease while it works, and completes it only if it still holds the lease. The rules are pure functions (`pitwall/src/jobs/lease.ts`), so forge and the backup obey the same logic and it is tested without a database. Two runners can therefore never process one job, and a runner that dies simply lets its lease run out.
- **Job ids are deterministic** (`kind__season__round__session`), so enqueueing the same work twice is a no-op and a missed timer can be replayed.
- **Every run leaves a record** (`pw_runs`): job, runner, times, outcome, counters, and the commit the worker was built from.
- **The worker never runs from a development checkout.** On this box a service that runs from a working tree runs whatever branch is checked out. It runs from a dedicated deploy checkout (`/data/pitwall-worker`) that only the `pitwall-worker-deploy` op updates.
- **Secrets live outside the repository** (`/etc/pitwall-worker.env`, mode 600), with the worker's own service account.
- **Production writes go through `aidlc op`**, like everything else in this repository.

## State (2026-09-19)
`pitwall/` has the job types, lease rules, an in-memory store, the runner loop, a Firestore store that has **not** been run against Firestore yet, and the F-070 projection model with its walk-forward backtest. Nothing here is deployed, nothing writes to production, and there is no systemd unit or deploy op yet: those wait for the owner's forge setup (ADR-002).

## Pit Wall worker
```
cd workers/pitwall
npm test                      # builds with the repository root's TypeScript, then node --test
# read-only export of the allowed inputs (from functions/, needs SA_KEY), to a path OUTSIDE the repo:
node ../../functions/scripts/exportPitwallHistory.js /data/pitwall-scratch/cache/history.json
npm run backtest -- /data/pitwall-scratch/cache/history.json /data/pitwall-scratch/reports
```
The model reads only `races`, `raceScores`, `priceHistory`, `drivers` and `constructors` (`src/model/inputs.ts`). Timing-derived data must never reach it (ADR-001); a test pins the list. Points come from `functions/src/scoring/scoringCore.ts`, imported directly, so a projection cannot drift from real scoring.
