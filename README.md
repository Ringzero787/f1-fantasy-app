# Undercut

A free fantasy motorsport game for Android, iOS and Fire tablets: pick five drivers and a constructor inside a budget, set an Ace, play in private leagues. This repository holds the app, its backend, and **Pit Wall**, the web analytics portal that goes with it.

It is an unofficial game and is not associated with any racing series or its rights holders.

## What is in here

| Part | Path | Runs on |
|---|---|---|
| The app (Expo, React Native) | `app/`, `src/` | Google Play, App Store, Amazon Appstore (`com.undercut.app`) |
| Backend (Cloud Functions) | `functions/` | Firebase project shared with a sibling app, Track Limits |
| Firestore and Storage rules, indexes | `firestore.rules`, `firestore.indexes.json`, `storage.rules`, tests in `rules-tests/` | the same Firebase project, **for both apps** |
| Static pages and App Links files | `public/` | Firebase Hosting, **for both apps** |
| Pit Wall portal (Vite, React) | `web/pitwall/` | Cloudflare Pages |
| Pit Wall worker (projections, briefing) | `workers/pitwall/` | a systemd service on the build box |
| Operations and release scripts | `scripts/ops/`, `scripts/release/` | the build box |
| Records: features, specs, decisions, ops, releases | `.aidlc/` | this repo |

Track Limits, the sibling app, lives in its own repository. It reads the race, driver and constructor data that Undercut's results ingestion writes, so a change to the rules, the indexes, Hosting or `functions/src/ingestion/` affects both apps.

## Where to look

- **What exists and what state it is in:** `.aidlc/features.yaml` (one entry per feature) with a spec each in `.aidlc/specs/`. Milestones are in `.aidlc/roadmap.yaml`.
- **What was released:** `CHANGELOG.md`, and `release-notes-<version>.md` for the store text.
- **Why things are the way they are:** `.aidlc/decisions/` (start at its README).
- **How to do things:** `docs/RUNBOOK.md` — a feature, a release, a production operation, a race weekend.
- **Design documents:** `docs/` (start at its README).
- **Rules for coding sessions:** `CLAUDE.md`.

## Reading a feature's status

| Status | Meaning |
|---|---|
| `idea` | Recorded, not committed to |
| `planned` | Committed to, not finished. May be partly live: read `status_note` |
| `building` | Being built now and due in the next release. The release run marks every `building` feature shipped, so this is not a parking place |
| `implemented` | Merged, not yet live. `status_note` says what it waits for |
| `shipped` | Live. `shipped_at` is the date; `version_shipped` is the store build that carried it, when one did |
| `deprecated` | Dropped, superseded or moved elsewhere. `status_note` says which |

`status_note` carries anything a single word cannot: merged and deliberately not run, live in part, blocked on a decision.

## Words used here

- **Ace** — the one pick on a team whose points count double for a round.
- **Moonshot** — a scarce, second-half-of-the-season call that stakes points or in-game cash on one driver's result.
- **Pit Wall** — the web portal: projections, a briefing, a lineup lab. **Pit Wall Pass** is its paid tier.
- **Lock** — the moment before a round's first scoring session when lineups freeze.
- **forge** — the Linux build box. It builds the Android apps, runs the Pit Wall worker and runs every production operation.
- **op** — a production change run through `aidlc op`: planned, dry-run, applied, recorded in `.aidlc/ops/`.
- **AIDLC** — the gate and record system this repository uses (`Ringzero787/aidlc`).
