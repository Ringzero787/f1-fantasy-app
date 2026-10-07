// Write the app-version gate of config/app (F-112): the floor below which the app blocks with
// "Update required" (src/components/AppUpdateGate.tsx reads minVersion; absent = no gate).
//
// DESIRED below is the owner's decision of 2026-10-07: every store build moves to 2.5.0 — the
// Moonshot build, with the F-099/F-101/F-103 fixes and the F-112 hardening — so the floor is 2.5.0,
// not merely 2.3.2 (the first build that asks the server whether a team name is free; everything
// older ran a global fantasyTeams query the scoped list rule now refuses). The op must be applied
// only once 2.5.0 is LIVE on Google Play, the Amazon Appstore and the App Store: the floor blocks
// every store at once, and the force screen on an Amazon install opens the Play URL, which is why
// updateMessage names the stores. AppUpdateGate shows updateMessage on the soft "new version"
// banner too, so the wording has to read right there as well. latestVersion is not touched. Dry run
// prints what is live beside what would be written; `--apply` merges only the keys below, so the
// Moonshot block and everything else in config/app survive.
//
// Usage (normally through the uc-script op kind, which sets SA_KEY and passes --apply):
//   node scripts/setAppVersionGate.js                        # dry run: show live vs desired
//   node scripts/setAppVersionGate.js --apply                # write DESIRED
//   node scripts/setAppVersionGate.js --minVersion=2.3.2 --apply   # a lower floor on a hand run
//
// The uc-script op kind passes only --apply, so through `aidlc op` the flag is not reachable:
// to move the floor in production, edit DESIRED here, commit, and raise a new uc-script op.
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';

// Nothing happens on import: the key read and initializeApp sit in initAdmin, which only the
// require.main guard at the foot calls (scripts/seedGuards.test.js holds every op script to this).
let db;
function initAdmin() {
  const KEY = process.env.SA_KEY;
  if (!KEY) {
    console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).');
    process.exit(2);
  }
  const cred = require(KEY);
  if (cred.project_id !== EXPECTED_PROJECT) {
    console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`);
    process.exit(2);
  }
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  db = admin.firestore();
}

/** The gate. Keys absent here keep whatever is live. */
const DESIRED = {
  minVersion: '2.5.0',
  updateMessage: 'Undercut 2.5.0 is out, with Moonshot and more. Update from the store you installed from — Google Play, the Amazon Appstore or the App Store — to keep playing.',
};

const VERSION = /^\d+\.\d+\.\d+$/;

/** Flags adjust DESIRED; validated here, from the guard, never on import. */
function blockFor(argv) {
  const block = { ...DESIRED };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m && m[1] === 'apply') { console.error('--apply takes no value. Nothing was written.'); process.exit(2); }
    if (!m || m[1] !== 'minVersion') { console.error(`"${a}" is not a flag this script understands. Nothing was written.`); process.exit(2); }
    if (!VERSION.test(m[2] || '')) { console.error('--minVersion must be MAJOR.MINOR.PATCH'); process.exit(2); }
    block.minVersion = m[2];
  }
  return block;
}

async function main(block, apply) {
  const ref = db.doc('config/app');
  const snap = await ref.get();
  const live = snap.exists ? snap.data() : {};
  const pick = (o) => ({ minVersion: o.minVersion ?? null, latestVersion: o.latestVersion ?? null, updateMessage: o.updateMessage ?? null });
  console.log('== live config/app gate:'); console.log(JSON.stringify(pick(live), null, 2));
  console.log('== desired (merged over live):'); console.log(JSON.stringify(block, null, 2));
  if (!apply) { console.log('== dry run: nothing written (add --apply)'); return; }
  await ref.set(block, { merge: true });
  console.log(`== wrote config/app gate (minVersion=${block.minVersion})`);
}

if (require.main === module) {
  // flags are checked before anything connects: a typo refuses without reaching production
  const argv = process.argv.slice(2);
  const block = blockFor(argv.filter((a) => a !== '--apply'));
  initAdmin();
  main(block, argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
