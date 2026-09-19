# ADR-002: Pit Wall infrastructure: Cloudflare for the site, forge for compute, GCP as backup

Date: 2026-09-19
Status: accepted (owner decision)

## Decision
1. The portal is served at **`pitwall.humannpc.com`** from Cloudflare Pages. humannpc.com is already on Cloudflare.
2. **forge** (the studio's Linux box) is the primary compute for ingest, aggregates, the projection simulation, news processing and briefings, as it already is for other studio products.
3. **GCP is the backup** for that compute: the same code as a Cloud Run Job, started by a watchdog only when forge is stale.
4. The Firebase project `f1-app-18077` remains the system of record (Auth, Firestore, Storage) and keeps the request-facing functions: sign-in handoff, Stripe checkout and webhook, entitlement grants, and the existing team callables.

## Why
Compute on forge has no marginal cost and far more headroom than Cloud Functions for simulation and backtests. Cloudflare already fronts the studio's sites. Keeping Firebase as the system of record means the app and the portal share accounts, teams and entitlements with no sync.

## Consequences
- The worker runs from a dedicated deploy checkout (`/data/pitwall-worker`) updated only by the `pitwall-worker-deploy` op, never from a development checkout, because a service that runs from a working tree deploys whatever branch is checked out.
- Jobs are claimed with transactional leases in `pw_jobs`, so forge and the GCP backup can never process the same job twice.
- Raw data lives in Cloud Storage with a local cache on forge, so the backup runner is self-sufficient.
- forge is a single machine on a home connection; a power or network outage is covered by the backup, at the cost of maintaining a container image.
- The site deploys through `pitwall-pages-deploy` (wrangler), not push-to-deploy, to keep the project's rule that production changes go through `aidlc op`.
