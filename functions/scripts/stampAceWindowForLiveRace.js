/**
 * F-095 one-off: stamp the ace window on the race weekend that was already under way
 * when the feature shipped.
 *
 * `autoLockTeams` stamps `lockStatus.aceLockTime` / `aceLockUntil` an hour before
 * qualifying, and it only looks at races still marked `upcoming`. The Bahrain weekend
 * locked before the new sweep was deployed, so its race is `in_progress` and no team
 * carries a window — this round would run with the ace exactly as unprotected as it was
 * on master, and the sweep will never come back for it. Every later round is covered
 * without help.
 *
 * It writes what the sweep would have written and nothing else: the race start time and
 * that plus the same 24h failsafe ceiling `nextUnlockTime` uses, on every team whose
 * league locks at qualifying. Locked or not, because the rule does not consult the lock.
 * A team that already has a window for this race is left alone.
 *
 * Usage (aidlc op new uc-script -p script=stampAceWindowForLiveRace.js -p backup=fantasyTeams):
 *   node scripts/stampAceWindowForLiveRace.js            # dry run, writes nothing
 *   node scripts/stampAceWindowForLiveRace.js --apply    # write
 */
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const UNLOCK_FAILSAFE_MS = 24 * 60 * 60 * 1000; // mirrors functions/src/locks/teamLocks.ts
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
  if (live.empty) { console.log('No race is in_progress; the sweep covers everything from here. Nothing to do.'); process.exit(0); }
  if (live.size > 1) { console.error(`Refusing to run: ${live.size} races are in_progress (${live.docs.map((d) => d.id).join(', ')}). Only one weekend can be live.`); process.exit(2); }

  const raceDoc = live.docs[0];
  const race = raceDoc.data();
  const start = race.schedule && race.schedule.race;
  if (!start || typeof start.toMillis !== 'function') { console.error(`Refusing to run: ${raceDoc.id} has no schedule.race timestamp.`); process.exit(2); }

  const startMs = start.toMillis();
  const until = admin.firestore.Timestamp.fromMillis(startMs + UNLOCK_FAILSAFE_MS);
  const now = Date.now();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · ${raceDoc.id} (${race.name || '?'})`);
  console.log(`  ace window ${start.toDate().toISOString()} → ${until.toDate().toISOString()}`);
  if (now >= startMs) {
    // Worth saying out loud rather than refusing: a window stamped after lights out still
    // protects the rest of the race, and the alternative is no protection at all.
    console.log(`  NOTE: the race started ${Math.round((now - startMs) / 60000)} min ago; any ace already moved stays moved.`);
  } else {
    console.log(`  lights out in ${Math.round((startMs - now) / 60000)} min`);
  }

  const leagues = await db.collection('leagues').get();
  const locksAtQualifying = new Map();
  leagues.forEach((d) => locksAtQualifying.set(d.id, ((d.data().settings || {}).lockDeadline || 'qualifying') === 'qualifying'));

  const teams = await db.collection('fantasyTeams').get();
  let batch = db.batch();
  let ops = 0, stamped = 0, already = 0, skipped = 0;

  for (const teamDoc of teams.docs) {
    const team = teamDoc.data();
    const eligible = !team.leagueId || locksAtQualifying.get(team.leagueId) !== false;
    if (!eligible) { skipped++; continue; }

    const existing = team.lockStatus && team.lockStatus.aceLockTime;
    if (existing && typeof existing.toMillis === 'function' && existing.toMillis() === startMs) { already++; continue; }

    stamped++;
    if (APPLY) {
      batch.update(teamDoc.ref, { 'lockStatus.aceLockTime': start, 'lockStatus.aceLockUntil': until });
      ops++;
      if (ops >= BATCH_OP_LIMIT) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
  }
  if (APPLY && ops > 0) await batch.commit();

  console.log(`\n${APPLY ? 'Stamped' : 'Would stamp'} ${stamped} of ${teams.size} team(s); ${already} already had this race's window; ${skipped} in a league that does not lock at qualifying.`);
  process.exit(0);
}

if (require.main === module) {
  initAdmin();
  main().catch((e) => { console.error(e); process.exit(1); });
}
