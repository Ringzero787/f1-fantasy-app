# f1-fantasy-app — Undercut and Track Limits

This repo runs the AIDLC gates from Ringzero787/aidlc. Records live in `.aidlc/`. Before building a feature: `aidlc feature check "<name>"`, then `aidlc feature add "TL: <name>"` (or `UC:` for Undercut), branch `feat/F-###-slug`, Conventional Commits. The `aidlc` skill in the plugin has the full flow.

- Two Expo apps share this repo: **Undercut** at the root (`app/`, `src/`, `functions/`, com.undercut.app) and **Track Limits** in `newgame/` (`newgame/app`, `newgame/src`, `newgame/functions`, com.tracklimits.app). Say which app a change targets.
- Registry names are prefixed `TL:` or `UC:` so the feature-exists gate matches within the right app.
- Store builds are local, never EAS: Android with gradle on the Linux build box, iOS with xcodebuild on the Mac Mini (there is no `newgame/eas.json`; the root `eas.json` is legacy). CI proves compilation with `expo export` only. Release notes per Track Limits version live in `newgame/release-notes-<v>.md`; AIDLC also writes `.aidlc/releases/`.
- Production changes — Firestore writes, seeding, Ben's lines and best bets, repair scripts, rules/indexes/functions deploys — go through `aidlc op` (kinds in `.aidlc/aidlc.yaml` under `overrides.ops`), never a bare script: `aidlc op new <kind> -t … -p key=value`, `aidlc op dryrun`, show the user the output, then `aidlc op apply`. Backups and logs land on `/mnt/smb/f1-app/aidlc-ops`, never in this public repo.
- Never commit `credentials.json`, `*.keystore`, `*.pem`, `google-services.json` changes with secrets, or `newgame/KEYSTORE.md`. The root has many untracked scratch files (F-033); do not `git add -A`.
- F1, Formula 1, FIA and Grand Prix are trademark watchlist terms: fine in descriptive copy, never in an app, feature, league or pack name.
