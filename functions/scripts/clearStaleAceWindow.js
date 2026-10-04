/**
 * F-098 one-off: clear an ace window left on a team the unlock sweep never visits.
 *
 * `autoUnlockTeams` is the only thing that clears the window, and it only looks at teams
 * that are `isLocked`. The F-095 rescue (OP-117) stamped every team the weekend covered,
 * locked or not — which is right, because the rule does not consult the lock — so the
 * teams that were already unlocked kept their stamp when the rest were cleared. The
 * window expires on its own at race + 24h, which is the point of stamping an end, but
 * until then those players cannot change their ace while everyone else can.
 *
 * Only runs between weekends: it refuses while any race is in_progress, because a live
 * weekend's window is exactly the thing that must not be cleared.
 *
 * Usage (aidlc op new uc-script -p script=clearStaleAceWindow.js -p backup=fantasyTeams):
 *   node scripts/clearStaleAceWindow.js            # dry run, writes nothing
 *   node scripts/clearStaleAceWindow.js --apply    # write
 */
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const BATCH_OP_LIMIT = 499;

let db;

function initAdmin() {
  const KEY = process.env.SA_KEY;
  if (!KEY) { console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).'); process.exit(2); }
  const cred = require(KEY);
  if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  db = admin.firestore();
}

const APPLY = process.argv.includes('--apply');

async function main() {
  const live = await db.collection('races').where('status', '==', 'in_progress').get();
  if (!live.empty) {
    console.error(`Refusing to run: ${live.docs.map((d) => d.id).join(', ')} is in_progress. A live weekend's ace window must not be cleared.`);
    process.exit(2);
  }

  const teams = await db.collection('fantasyTeams').get();
  let batch = db.batch();
  let ops = 0, cleared = 0, lockedSkipped = 0, clean = 0;

  for (const teamDoc of teams.docs) {
    const team = teamDoc.data();
    const ls = team.lockStatus || {};
    const hasWindow = !!(ls.aceLockTime || ls.aceLockUntil || ls.aceFreezeFrom);
    if (!hasWindow) { clean++; continue; }
    // A locked team is the unlock sweep's to clear, on its own schedule.
    if (team.isLocked) { lockedSkipped++; continue; }

    cleared++;
    const when = ls.aceLockTime && ls.aceLockTime.toDate ? ls.aceLockTime.toDate().toISOString() : '?';
    console.log(`  ${teamDoc.id} (${team.name || '?'}) — window from ${when}`);
    if (APPLY) {
      batch.update(teamDoc.ref, {
        'lockStatus.aceFreezeFrom': null,
        'lockStatus.aceLockTime': null,
        'lockStatus.aceLockUntil': null,
        'lockStatus.aceQualiKey': null,
        'lockStatus.aceSprintKey': null,
      });
      ops++;
      if (ops >= BATCH_OP_LIMIT) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
  }
  if (APPLY && ops > 0) await batch.commit();

  console.log(`\n${APPLY ? 'Cleared' : 'Would clear'} ${cleared} of ${teams.size} team(s); ${lockedSkipped} still locked (the sweep's to clear); ${clean} already clean.`);
  process.exit(0);
}

if (require.main === module) {
  initAdmin();
  main().catch((e) => { console.error(e); process.exit(1); });
}
