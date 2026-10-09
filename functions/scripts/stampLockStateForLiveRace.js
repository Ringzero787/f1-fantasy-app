/**
 * F-118 one-off: publish `config/lockState` for the weekend that was already under way when the
 * feature shipped.
 *
 * `autoLockTeams` writes that document, and it only looks at races still `upcoming` — locking a
 * weekend is what takes the race out of that set. Singapore locked at sprint qualifying on
 * 2026-10-09, about an hour before F-118 was deployed, so its race is `in_progress`, no marker
 * exists, and the sweep will never come back for it. Without this the new freeze does nothing for
 * this round: a team created now would have no marker to be measured against, which is the whole
 * hole F-118 closes. Every later round is covered without help.
 *
 * The same landmine as F-095's stampAceWindowForLiveRace.js, one layer up: check for an
 * `in_progress` race after any deploy that changes what the sweep writes.
 *
 * It writes exactly what the sweep would have written, derived from the race's own schedule, and
 * nothing else. It refuses if a marker already exists, rather than overwriting one — a live
 * weekend's aces hang off it.
 *
 * Usage (aidlc op new uc-script -p script=stampLockStateForLiveRace.js -p backup=config/lockState):
 *   node scripts/stampLockStateForLiveRace.js            # dry run, writes nothing
 *   node scripts/stampLockStateForLiveRace.js --apply    # write
 */
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const UNLOCK_FAILSAFE_MS = 24 * 60 * 60 * 1000; // mirrors functions/src/utils/lockTime.ts
const WEEKEND_WINDOW_MS = 36 * 60 * 60 * 1000;  // mirrors raceWeekendIsLive's bound

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

/** The first session whose points the ace doubles — mirrors aceFreezeStart in lockTime.ts. */
function aceFreezeStart(race) {
  const qualifying = race.schedule?.qualifying ?? null;
  const sprint = race.schedule?.sprint ?? (race.hasSprint === true ? race.schedule?.sprintQualifying ?? null : null);
  if (sprint && qualifying) return sprint.toMillis() <= qualifying.toMillis() ? sprint : qualifying;
  return sprint ?? qualifying ?? race.schedule?.race ?? null;
}

async function main() {
  const existing = await db.doc('config/lockState').get();
  if (existing.exists) {
    console.error('config/lockState already exists — refusing to overwrite it:');
    console.error(JSON.stringify(existing.data(), null, 2));
    console.error('A live weekend\'s ace freeze hangs off this document. Delete it by hand only if');
    console.error('you are certain it is stale, then run again.');
    process.exit(2);
  }

  const live = await db.collection('races').where('status', '==', 'in_progress').get();
  const now = Date.now();
  const usable = live.docs.filter((doc) => {
    const startMs = doc.data()?.schedule?.race?.toMillis?.();
    if (typeof startMs !== 'number') {
      console.warn('Skipping %s: no usable race start', doc.id);
      return false;
    }
    // The same bound raceWeekendIsLive applies: `in_progress` has no way out but success, and a
    // stuck latch from a past weekend must not become a marker that freezes new teams.
    if (now - startMs >= WEEKEND_WINDOW_MS) {
      console.warn('Skipping %s: race started %.1fh ago, outside the 36h weekend window',
        doc.id, (now - startMs) / 3600000);
      return false;
    }
    return true;
  });

  if (usable.length === 0) { console.log('No live race weekend needs a marker. Nothing to do.'); return; }
  if (usable.length > 1) {
    console.error('More than one live race weekend: %s. Refusing to guess which one owns the marker.',
      usable.map((d) => d.id).join(', '));
    process.exit(2);
  }

  const doc = usable[0];
  const race = doc.data();
  const start = race.schedule.race;
  const from = aceFreezeStart(race) ?? start;
  const state = {
    raceId: doc.id,
    lockedAt: admin.firestore.FieldValue.serverTimestamp(),
    aceFreezeFrom: from,
    aceLockTime: start,
    aceLockUntil: admin.firestore.Timestamp.fromMillis(start.toMillis() + UNLOCK_FAILSAFE_MS),
    aceQualiKey: `quali_${doc.id}`,
    aceSprintKey: (race.schedule?.sprint || race.hasSprint === true) ? `sprint_${doc.id}` : null,
  };

  // The teams the sweep already stamped must agree with this marker, or the new gate treats every
  // one of them as unstamped: the roster check compares the instant, and the rule compares
  // aceLockTime. Report it rather than assume it.
  const teams = await db.collection('fantasyTeams').get();
  let agree = 0, disagree = 0, unstamped = 0;
  teams.forEach((t) => {
    const own = t.data()?.lockStatus?.aceLockTime;
    if (!own?.toMillis) { unstamped++; return; }
    if (own.toMillis() === start.toMillis()) agree++; else disagree++;
  });

  console.log('live race      : %s (%s)', doc.id, race.name);
  console.log('aceFreezeFrom  : %s', from.toDate().toISOString());
  console.log('aceLockTime    : %s', start.toDate().toISOString());
  console.log('aceLockUntil   : %s', state.aceLockUntil.toDate().toISOString());
  console.log('aceQualiKey    : %s', state.aceQualiKey);
  console.log('aceSprintKey   : %s', state.aceSprintKey);
  console.log('teams          : %d stamped for this race, %d stamped for another, %d unstamped',
    agree, disagree, unstamped);
  if (disagree > 0) {
    console.warn('%d team(s) carry a DIFFERENT aceLockTime. They will be treated as unstamped and', disagree);
    console.warn('refused roster edits until this weekend ends. Investigate before applying.');
  }

  if (!APPLY) { console.log('== dry run: nothing written (add --apply)'); return; }
  await db.doc('config/lockState').set(state);
  console.log('== wrote config/lockState for %s', doc.id);
}

if (require.main === module) {
  initAdmin();
  main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
}
