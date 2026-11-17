# Runbook

How the recurring jobs are done. `CLAUDE.md` has the rules; this has the steps. Where a step needs the owner, it says so.

## Where things run

| Thing | Where |
|---|---|
| CI (deterministic gates: typecheck, tests, export build, scanners) | GitHub Actions, on every non-draft PR. Nothing runs on `master` itself |
| Model review (spec, security, quality, IP) | the build box, before a merge, through Claude Code (ADR-003) |
| Android and Amazon store builds | the build box, with gradle |
| iOS store build | the Mac Mini, driven from the build box over SSH |
| Production operations (`aidlc op`) | the build box only: the service-account key lives there |
| Pit Wall worker | the build box, `systemctl status pitwall-worker` |
| Pit Wall health check | the build box, hourly from cron |

Work in a git worktree of your own, branched from `origin/master`. The checkout at `/data/f1-app` is shared between sessions and holds many untracked files; do not move its branch and do not `git add` a directory in it.

## A feature

1. `aidlc feature check "<name>"` — does it already exist?
2. `aidlc feature add "UC: <name>"` — registers it and creates `.aidlc/specs/F-###.md`. Check `git status .aidlc/` straight after: the command has been seen to reuse an id.
3. Fill in the spec: goal, testable acceptance criteria, targets, data, what is out of scope.
4. Branch `feat/F-###-slug`, Conventional Commits, PR against `master`.
5. Run the model review on the branch diff with the four `aidlc:*` agents, fix what they find, and record in the PR body that it ran and what it found.
6. Merge when CI is green.
7. Update the registry entry: `shipped` with `shipped_at` once it is live, or leave the status and write what it waits for in a `status_note` field. See "Reading a feature's status" in the root `README.md`.

## A production operation

Anything that changes production — a deploy of functions, rules, indexes, Hosting, the portal or the worker; a data script; a Moonshot model seed; a Play publish — is an op.

1. `aidlc op kinds` lists what exists. `aidlc op new <kind> -t "<title>" -p key=value` plans one and writes `.aidlc/ops/OP-###.yaml`.
2. `aidlc op dryrun OP-###` shows what it would do.
3. **The owner reads the dry-run output and runs `aidlc op apply OP-###`.** Do not merge anything between the dry run and the apply: the apply checks that the code has not moved.
4. Read the apply output for each resource's own success line. The op's final verdict has said "applied" over a failed deploy before.
5. Commit the op record in a `chore(aidlc): record …` PR.

Backups and logs go to the private share (`/mnt/smb/f1-app/aidlc-ops/OP-###/`), never into this repository.

A change to `firestore.rules`, the indexes, Hosting or `functions/src/ingestion/` also reaches Track Limits. Say so in the PR and the op title.

## A release

1. Everything for the release is merged, and the last merged PR's CI was green.
2. On the build box, from a checkout that has the untracked build inputs (`.env`, `google-services.json`, `GoogleService-Info.plist`, the keystore): `aidlc run --tier release --unit undercut --version X.Y.Z`. It bumps the version, builds the Play bundle and the Amazon APK, and drives the Mac Mini to archive the iOS build. It writes the notes under `.aidlc/releases/`, the `CHANGELOG.md` entry, and updates the registry and roadmap.
3. **It publishes one thing by itself:** the iOS build is uploaded to App Store Connect unless `UC_SKIP_PUBLISH=1` is set. The bundle and the APK are copied to the share.
4. **It does not commit or tag.** Commit the version bump and the records, then tag `uc-vX.Y.Z` on the `master` commit by hand.
5. Read the generated notes before using them; write `release-notes-X.Y.Z.md` by hand from them.
6. Check the registry afterwards. The run marks every `building` `UC:` feature shipped. It also marks every `UC:` feature named in the subject of a commit that touches the release paths (`app/`, `src/`, `functions/`, `app.config.js`, `package.json`) since the last tag, and overwrites the version on one that was already shipped. Put back anything it marked that is not live.
7. Publish: Play through the `uc-play-publish` op. Submitting the App Store build for review and uploading the APK to Amazon are the owner's.

## A race weekend

Results come from the timing provider into Cloud Functions; nothing on the build box is needed to score a race. The box only publishes the Pit Wall numbers.

- **Before the first session:** the hourly check is quiet when all is well. To look: `bash scripts/ops/pitwall-check.sh` prints a report and files it on the share.
- **After each scoring session:** results are fetched and scored without anyone doing anything. If a round has not scored within a few hours, read `blockedReason` on the race's `pendingResults` document first. A car number the driver table does not know is first resolved by name from the provider's entry list; when that fails too, the whole result is held. Held results are retried by themselves every 30 minutes for 14 days, so deploying the missing mapping is enough.
- **An email from the worker** means a round of its work failed. Whatever the cause — the box losing its network connection, a stuck database client, a failed job — it delays the portal and does not touch scoring. (From the worker release after F-153 the email says in plain words what happened and whether anything needs doing, and an "is back" email follows; before that release it is the raw error.)
- **The provider's entry list is the source for a driver mapping.** Read it before mapping a stand-in; guessing a car number has cost a three-day delay before.

## The season change

The 2026 to 2027 change is specified in `.aidlc/specs/F-150.md` (the rollover op), with `F-149` and `F-151` (season-aware ingestion and server season scope) already live. The rollover must not run until the last 2026 race is scored and a day has passed, and nothing for 2027 may be seeded before then. The work between the rollover and the 2027 opener is listed in `.aidlc/specs/F-150.md` under "before the 2027 opener", and in the 2027 readiness milestone in `.aidlc/roadmap.yaml` once that exists.
