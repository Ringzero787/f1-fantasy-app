/**
 * Read-only: does the live `races` collection agree with the calendar this
 * repo pins?
 *
 * Undercut's ingestion is the only writer of `races`, and Track Limits settles
 * real garage cash against it, so a wrong round or session time there is not a
 * display bug. On 2026-10-02 a stale ROUND_TO_RACE_ID wrote one race's session
 * times onto another race's document, which put two races inside Track Limits'
 * 24h reminder window and sent players 1,273 notifications.
 *
 * Three copies of the calendar are already pinned to each other by tests:
 * functions/test/fixtures/races2026.json is checked against ROUND_TO_RACE_ID by
 * functions/test/roundMapping.test.js, and against the app's bundled fallback
 * by __tests__/data/demoCalendar.test.ts. Nothing checks the fourth copy — the
 * live Firestore documents — because no test can reach them. This script is
 * that check, run by hand through `aidlc op`.
 *
 * It writes nothing. There is no --apply path, so the dry run is the whole
 * operation.
 *
 * Usage (aidlc op new uc-script -p script=checkRaceCalendar.js -p backup=):
 *   node scripts/checkRaceCalendar.js
 *
 * Exit 0 when the live calendar matches, 1 when it does not, 2 on a setup
 * problem. A mismatch is worth looking at before a race weekend locks.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const EXPECTED_PROJECT = 'f1-app-18077';
const SEASON = '2026';

const KEY = process.env.SA_KEY;
if (!KEY) { console.error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).'); process.exit(2); }
const cred = require(KEY);
if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }

const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'races2026.json');
if (!fs.existsSync(FIXTURE)) { console.error(`Missing ${FIXTURE} — without it this check proves nothing.`); process.exit(2); }
const parsedFixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const fixtureRaces = Array.isArray(parsedFixture) ? parsedFixture : parsedFixture.races;
if (!Array.isArray(fixtureRaces) || fixtureRaces.length === 0) { console.error('Fixture parsed but holds no races.'); process.exit(2); }

const configPath = path.join(__dirname, '..', 'lib', 'ingestion', 'config.js');
if (!fs.existsSync(configPath)) { console.error('functions/lib is not built. Run: npm --prefix functions run build'); process.exit(2); }
const { ROUND_TO_RACE_ID, SPRINT_ROUNDS } = require(configPath);

admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
const db = admin.firestore();

const asDate = (v) => {
  if (v == null) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const iso = (v) => { const d = asDate(v); return d ? d.toISOString() : null; };

(async () => {
  console.log(`READ-ONLY CHECK · project ${EXPECTED_PROJECT} · season ${SEASON} · ${new Date().toISOString()}`);

  const snap = await db.collection('races').where('seasonId', '==', SEASON).get();
  const live = new Map(snap.docs.map((d) => [d.id, d.data()]));
  console.log(`live races: ${live.size} · pinned fixture races: ${fixtureRaces.length}\n`);

  const problems = [];

  for (const want of fixtureRaces) {
    const got = live.get(want.id);
    if (!got) { problems.push(`${want.id}: pinned as round ${want.round} but NOT PRESENT in Firestore`); continue; }
    if (got.round !== want.round) problems.push(`${want.id}: round is ${got.round}, pinned ${want.round}`);
    // Status is a lifecycle, not a fixed value: the fixture holds the seeded
    // starting state, and a race legitimately moves upcoming -> in_progress ->
    // completed as the season runs. Comparing it outright made this report 15
    // false problems on its first run and would have trained everyone to
    // ignore it. Only `cancelled` is a pinned fact, in either direction —
    // a race cancelled live but not pinned (or the reverse) is the mismatch
    // that misfiles data, because the ingestion skips cancelled rounds.
    const wantCancelled = want.status === 'cancelled';
    const gotCancelled = got.status === 'cancelled';
    if (wantCancelled !== gotCancelled) {
      problems.push(`${want.id}: status is '${got.status}', pinned '${want.status}' — cancellation state must match`);
    }
    if (!!got.hasSprint !== !!want.hasSprint) problems.push(`${want.id}: hasSprint is ${!!got.hasSprint}, pinned ${!!want.hasSprint}`);
  }
  for (const id of live.keys()) {
    if (!fixtureRaces.some((r) => r.id === id)) problems.push(`${id}: present in Firestore but not in the pinned calendar`);
  }

  // The mapping the ingestion actually uses, against what is live.
  for (const [roundStr, raceId] of Object.entries(ROUND_TO_RACE_ID)) {
    const round = Number(roundStr);
    const got = live.get(raceId);
    if (!got) { problems.push(`ROUND_TO_RACE_ID[${round}] = ${raceId}, which has no live document`); continue; }
    if (got.round !== round) problems.push(`ROUND_TO_RACE_ID[${round}] = ${raceId}, but that document says round ${got.round} — ingestion would file this weekend's data on the wrong race`);
  }
  for (const round of SPRINT_ROUNDS) {
    const raceId = ROUND_TO_RACE_ID[round];
    const got = raceId && live.get(raceId);
    if (got && !got.hasSprint) problems.push(`round ${round} (${raceId}) is in SPRINT_ROUNDS but the live document has hasSprint ${!!got.hasSprint}`);
  }

  // What is next, and when it locks — the question worth asking on a race weekend.
  const now = new Date();
  const upcoming = [...live.entries()]
    .map(([id, r]) => ({ id, round: r.round, status: r.status, hasSprint: !!r.hasSprint, schedule: r.schedule || {} }))
    .filter((r) => r.status !== 'cancelled' && r.status !== 'completed')
    .sort((a, b) => (a.round || 0) - (b.round || 0));
  const next = upcoming.find((r) => { const d = asDate(r.schedule.race); return d && d.getTime() + 4 * 3600 * 1000 > now.getTime(); });

  if (!next) {
    console.log('No upcoming race with a future race time.');
  } else {
    const lock = next.hasSprint && next.schedule.sprintQualifying ? next.schedule.sprintQualifying : (next.schedule.fp3 || next.schedule.qualifying);
    console.log(`next race   : ${next.id} (round ${next.round}${next.hasSprint ? ', sprint' : ''}), status ${next.status}`);
    console.log(`  fp3       : ${iso(next.schedule.fp3)}`);
    console.log(`  qualifying: ${iso(next.schedule.qualifying)}`);
    console.log(`  race      : ${iso(next.schedule.race)}`);
    console.log(`  teams lock: ${iso(lock)}  (${asDate(lock) && asDate(lock) <= now ? 'LOCKED NOW' : 'not yet'})`);
    console.log(`  ace locks : ${iso(next.schedule.race)}  (${asDate(next.schedule.race) && asDate(next.schedule.race) <= now ? 'LOCKED NOW' : 'not yet'})\n`);
  }

  if (problems.length === 0) {
    console.log('OK — the live calendar matches the pinned one on round, status and sprint flag, and ROUND_TO_RACE_ID resolves correctly for every mapped round.');
    process.exit(0);
  }
  console.log(`${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(2); });
