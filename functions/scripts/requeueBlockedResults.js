/**
 * Re-queue results the ingestion parked (F-134).
 *
 * checkOpenF1Results holds a race as pendingResults/{raceId} with status 'pending' and a
 * blockedReason when the provider's grid has a car it cannot map, and the scheduler then skips
 * that race on every tick. Once the mapping is deployed, the way back is to set the document to
 * 'rejected': the next tick re-fetches the race with the new code, settles it and auto-approves,
 * and the write to races/{raceId} runs onRaceCompleted. This script does exactly that for every
 * blocked pending result whose race is not completed; nothing else is touched.
 *
 * Usage:
 *   node scripts/requeueBlockedResults.js            # dry run, writes nothing
 *   node scripts/requeueBlockedResults.js --apply    # set each blocked result to 'rejected'
 */

const admin = require('firebase-admin');
const EXPECTED_PROJECT = 'f1-app-18077';

// Nothing happens on import (see repairStuckLocks.js for why). `aidlc op` runs this through
// scripts/ops/run-script.js, which spawns the file directly, so require.main holds there.
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

const APPLY = process.argv.includes('--apply');

async function main() {
  const { FieldValue } = admin.firestore;
  const pending = await db.collection('pendingResults').where('status', '==', 'pending').get();
  const rows = [];
  for (const doc of pending.docs) {
    const p = doc.data();
    if (!p.blockedReason) continue;
    const race = await db.collection('races').doc(doc.id).get();
    const status = race.exists ? race.data().status : 'missing';
    if (status === 'completed') continue;
    rows.push({ id: doc.id, round: p.round, status, blockedReason: String(p.blockedReason), fetchedAt: p.fetchedAt && p.fetchedAt.toDate ? p.fetchedAt.toDate().toISOString() : null, drivers: p.results && p.results.raceResults ? p.results.raceResults.length : 0 });
  }

  console.log(`\n=== requeueBlockedResults (${APPLY ? 'APPLY' : 'DRY RUN'}) — ${new Date().toISOString()} ===\n`);
  if (rows.length === 0) {
    console.log('No blocked pending results for an unscored race. Nothing to do.');
    process.exit(0);
  }
  for (const r of rows) {
    console.log(`${r.id} (round ${r.round}, race ${r.status}) fetched ${r.fetchedAt}, ${r.drivers} drivers held`);
    console.log(`   blocked: ${r.blockedReason}`);
    console.log(`   → status 'pending' becomes 'rejected'; checkOpenF1Results re-fetches it within 10 minutes`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to re-queue.');
    process.exit(0);
  }

  for (const r of rows) {
    await db.collection('pendingResults').doc(r.id).set({
      status: 'rejected',
      requeuedAt: FieldValue.serverTimestamp(),
      requeuedFrom: { status: 'pending', blockedReason: r.blockedReason },
    }, { merge: true });
    console.log(`re-queued ${r.id}`);
  }
  console.log('\nDone. Watch pendingResults/{raceId}.status → approved and races/{raceId}.status → completed on the next ticks.');
  process.exit(0);
}

if (require.main === module) {
  initAdmin();
  main().catch((e) => { console.error('requeueBlockedResults failed:', e); process.exit(1); });
}
