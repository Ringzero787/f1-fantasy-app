// Write the app-version gate of config/app (F-112): the floor below which the app blocks with
// "Update required" (src/components/AppUpdateGate.tsx reads minVersion; absent = no gate).
//
// THE FLOOR IS 2.3.2, AND THAT IS DELIBERATELY NOT THE 2.5.0 FORCE-UPDATE (owner, 2026-10-09).
// Two separate decisions were bundled here and the bundling blocked a security fix:
//   1. The SECURITY MINIMUM is 2.3.2 — the first build that asks the server whether a team name is
//      free. Everything older runs a global fantasyTeams query that F-112's scoped list rule
//      refuses, so the floor has to be at least this before those rules deploy, or an old device
//      gets a failed rename instead of the update screen. F-112's own spec says 2.3.2 "would have
//      been the minimum the rule needs".
//   2. The 2.5.0 FORCE-UPDATE — moving every store onto the Moonshot build — is the owner's
//      product decision of 2026-10-07. It is NOT required by any rule.
// (2) needs 2.5.0 live on all three stores; (1) does not, and holding (1) hostage to (2) left the
// F-112 rules undeployed. So the floor here is the security minimum, and the force-update is a
// later, separate change: edit DESIRED to 2.5.0, commit, raise a NEW op, once 2.5.0 or newer is
// live on Google Play, the Amazon Appstore and the App Store.
//
// WHY 2.3.2 AND NOT 2.4.3, which the oldest live store would also allow: 2.4.3 is the first build
// with the legacy Amazon sign-in flow deleted (F-094) — the one that hands an Amazon authorization
// code to a custom scheme any installed Android app can claim — so a 2.4.3 floor would retire that
// client population and unblock deleting the `signInWithAmazon` callable. It was NOT taken here
// because it has a precondition nobody can check from this machine: on 2.4.3+ the replacement web
// flow is gated off until the Login with Amazon return URL is registered, so a Fire OS user who
// signs out, or installs fresh, could be left with no Amazon sign-in at all. Already-signed-in
// users would be fine (the session survives the update). Raise it to 2.4.3 as a separate, owner-
// confirmed change once that return URL is registered.
//
// STORE PRECONDITION, every time this changes: the floor must be at or below what is LIVE on the
// OLDEST store, not what has been built. The floor blocks all three at once, and the force screen
// on an Amazon install opens the PLAY url (AppUpdateGate.openStore has no Amazon branch), so a
// locked-out Fire OS user cannot even reach their own store. Known live at 2026-10-09: Play 2.5.1
// (vc70), App Store 2.5.0 (2.5.1 staged, not submitted), Amazon 2.4.3 (vc68) — the oldest is
// Amazon's 2.4.3, which clears a 2.3.2 floor and does NOT clear 2.5.0. Re-check all three before
// moving it; Amazon has no API, so that one is always a question for the owner.
//
// NOTE FOR WHOEVER FINDS OP-156: it was planned while DESIRED said 2.5.0 and its title claims it
// forces 2.5.0. It would now write 2.3.2. Do not apply it for either purpose — raise a fresh op,
// which also forces a fresh dry-run that prints the value actually about to be written.
//
// AppUpdateGate shows updateMessage on the dismissible "new
// version" banner too (current >= minVersion but < latestVersion), so the message carries no
// version number and no "to keep playing": it has to read right on both screens, and whenever
// latestVersion is later moved above the floor, rewrite it here. latestVersion is not touched. Dry
// run prints what is live beside what would be written; `--apply` merges only the keys below (the
// --minVersion flag moves the floor; updateMessage from DESIRED is still written), so the Moonshot
// block and everything else in config/app survive. scripts/versionGate.test.js holds the floor to
// at most the version app.config.js ships — a floor above the current build locks everyone out.
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

// What is actually LIVE in each store, by hand, because the floor blocks all three at once and a
// floor above the oldest one locks those users out — on Amazon without even a reachable store.
// Structured rather than prose so the guard below and the test can read it per store: an earlier
// version of this lived only in the header comment, and a regex over prose could be made to pass
// vacuously by mentioning the floor near it. Amazon has no API, so it is always a question for the
// owner; update every entry whenever a release goes live, and the date with it.
const KNOWN_LIVE = {
  asOf: '2026-10-09',
  play: '2.5.1',       // vc70
  appStore: '2.5.0',   // 2.5.1 staged, not submitted
  amazon: '2.4.3',     // vc68 — the oldest, and the one that bounds the floor
};

const STORES = ['play', 'appStore', 'amazon'];

/** The oldest version live in any store, as [major, minor, patch]. */
function oldestLive() {
  const parse = (v) => v.split('.').map((n) => parseInt(n, 10));
  const lte = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return true; };
  return STORES.map((k) => {
    const v = KNOWN_LIVE[k];
    if (!/^\d+\.\d+\.\d+$/.test(v || '')) {
      console.error(`KNOWN_LIVE.${k} is not MAJOR.MINOR.PATCH. Nothing was written.`);
      process.exit(2);
    }
    return parse(v);
  }).reduce((a, b) => (lte(a, b) ? a : b));
}

/**
 * Refuse a floor above the oldest live store. This is the whole safety property: a floor that no
 * store can satisfy is a hard block with no dismiss and no way out, and it is not undoable from
 * the device — it needs a rollback op. Checked before anything connects, and it covers the
 * --minVersion flag too, not just DESIRED.
 */
function refuseIfItWouldLockAnyoneOut(floor) {
  const parse = (v) => v.split('.').map((n) => parseInt(n, 10));
  const lte = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return true; };
  const oldest = oldestLive();
  if (!lte(parse(floor), oldest)) {
    const which = STORES.filter((k) => KNOWN_LIVE[k] === oldest.join('.'));
    console.error(
      `Refusing to write minVersion ${floor}: the oldest live store is ${oldest.join('.')}`
      + `${which.length ? ` (${which.join(', ')})` : ''}, as of ${KNOWN_LIVE.asOf}.\n`
      + 'Those users would be hard-blocked with no way to update — on Amazon not even a reachable\n'
      + 'store, because AppUpdateGate.openStore has no Amazon branch. Ship the build to every store\n'
      + 'first, then update KNOWN_LIVE here. Nothing was written.');
    process.exit(2);
  }
}

const LIVE_DECLARATION_MAX_AGE_DAYS = 45;

/**
 * Refuse to APPLY on a stale live-store declaration. Deliberately not a test: a check that fails
 * with the passage of time would block unrelated CI runs, and the declaration only matters at the
 * moment something is written.
 */
function refuseIfLiveSetIsStale() {
  const asOf = Date.parse(`${KNOWN_LIVE.asOf}T00:00:00Z`);
  if (Number.isNaN(asOf)) {
    console.error('KNOWN_LIVE.asOf is not a YYYY-MM-DD date. Nothing was written.');
    process.exit(2);
  }
  const days = Math.floor((Date.now() - asOf) / 86400000);
  if (days > LIVE_DECLARATION_MAX_AGE_DAYS) {
    console.error(
      `Refusing to write: KNOWN_LIVE was last checked ${days} days ago (${KNOWN_LIVE.asOf}).\n`
      + 'The floor is only safe relative to what is live, so re-check Play, the App Store and the\n'
      + 'Amazon Appstore, update KNOWN_LIVE and its asOf date, then run again. Nothing was written.');
    process.exit(2);
  }
}

/** The gate. Keys absent here keep whatever is live. */
const DESIRED = {
  minVersion: '2.3.2',
  // The Fire OS mitigation lives HERE, not in the app. AppUpdateGate.openStore has no Amazon
  // branch, so on a Fire tablet the button opens Google Play and does nothing useful — and an
  // app-side fix cannot reach a build that is already installed below the floor, which is
  // exactly who sees this screen. This text is read from Firestore, so it reaches them.
  updateMessage: 'A new Undercut build is out, with Moonshot and more. Update from the store you installed from — Google Play, the Amazon Appstore or the App Store. On a Fire tablet, open the Amazon Appstore and search for Undercut: the button below cannot take you there.',
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
  console.log(`== wrote config/app gate: ${Object.entries(block).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
}

// Only inert values and the pure helper. The two refuse* functions are what the require.main
// guard runs, and scripts/seedGuards.test.js forbids naming those at module scope — a bare
// reference is enough to defer or alias them into running on a plain require(). The test
// exercises them through a child process instead, which is also closer to how the op runs.
module.exports = { KNOWN_LIVE, STORES, oldestLive, LIVE_DECLARATION_MAX_AGE_DAYS };

if (require.main === module) {
  // flags are checked before anything connects: a typo refuses without reaching production
  const argv = process.argv.slice(2);
  const block = blockFor(argv.filter((a) => a !== '--apply'));
  refuseIfItWouldLockAnyoneOut(block.minVersion);
  if (argv.includes('--apply')) refuseIfLiveSetIsStale();
  initAdmin();
  main(block, argv.includes('--apply')).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
