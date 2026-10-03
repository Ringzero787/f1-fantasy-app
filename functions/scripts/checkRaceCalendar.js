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
 * Three copies of the calendar are pinned to each other by tests:
 * functions/test/fixtures/races2026.json is checked against ROUND_TO_RACE_ID by
 * functions/test/roundMapping.test.js, and against the app's bundled fallback
 * by __tests__/data/demoCalendar.test.ts. Nothing checks the fourth copy — the
 * live Firestore documents — because no test can reach them. This script is
 * that check, run by hand through `aidlc op`.
 *
 * There is a fifth copy, and it is pinned by nothing: functions/src/seedData.ts
 * still holds the pre-renumber season (Bahrain at round 4, Singapore 18, Abu
 * Dhabi 24, no cancelled races) with full schedules, and calls seedDatabase()
 * at module scope. Nothing imports it, but running it would write
 * singapore_2026.round = 18 while ROUND_TO_RACE_ID[18] is bahrain_2026 — the
 * F-086 collision, recreated. This script would catch the aftermath; it cannot
 * prevent the run.
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

// Exit 2 means "could not check", exit 1 means "the calendar is wrong". Keeping
// them apart matters: an operator who sees 1 goes looking for a Firestore
// problem. require() and JSON.parse throw, and an uncaught throw exits 1, so
// the setup has to be inside a handler rather than relying on the existsSync
// guards alone — a present-but-corrupt key, fixture or build all land here.
let cred, fixtureRaces, ROUND_TO_RACE_ID, SPRINT_ROUNDS, db;
try {
  const KEY = process.env.SA_KEY;
  if (!KEY) throw new Error('SA_KEY must point at the service-account key (set by aidlc op from ~/.config/aidlc/env).');
  cred = require(KEY);
  if (cred.project_id !== EXPECTED_PROJECT) throw new Error(`key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}`);

  const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'races2026.json');
  if (!fs.existsSync(FIXTURE)) throw new Error(`missing ${FIXTURE} — without it this check proves nothing`);
  const parsedFixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  fixtureRaces = Array.isArray(parsedFixture) ? parsedFixture : parsedFixture.races;
  if (!Array.isArray(fixtureRaces) || fixtureRaces.length === 0) throw new Error('fixture parsed but holds no races');

  const configPath = path.join(__dirname, '..', 'lib', 'ingestion', 'config.js');
  if (!fs.existsSync(configPath)) throw new Error('functions/lib is not built. Run: npm --prefix functions run build');
  ({ ROUND_TO_RACE_ID, SPRINT_ROUNDS } = require(configPath));

  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  db = admin.firestore();
} catch (e) {
  console.error(`Cannot run the check: ${e && e.message ? e.message : e}`);
  process.exit(2);
}

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

  const problems = [];   // exit 1: the calendar is not safe to lock against
  const notes = [];      // printed, exit 0: worth knowing, cannot affect a future lock

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
    if (!raceId) { problems.push(`round ${round} is in SPRINT_ROUNDS but ROUND_TO_RACE_ID has no entry for it — its sprint results would never be ingested`); continue; }
    const got = live.get(raceId);
    if (got && !got.hasSprint) problems.push(`round ${round} (${raceId}) is in SPRINT_ROUNDS but the live document has hasSprint ${!!got.hasSprint}`);
  }

  // Session times. The fixture deliberately carries none, and pinning them
  // would be wrong anyway: syncSchedule legitimately rewrites times from
  // OpenF1 whenever the FIA moves a session, so an expected-value check would
  // cry wolf the way the status comparison did. These are internal invariants
  // instead — they need no oracle, and they are what F-086 actually broke.
  // That incident wrote one race's session times onto another race's document;
  // every other check in this script passes once ROUND_TO_RACE_ID is fixed,
  // because syncSchedule merges by dot-path and leaves the stale keys sitting
  // on the wrong document.
  const DAY = 24 * 3600 * 1000;
  const runnable = [...live.entries()]
    .map(([id, r]) => ({ id, round: r.round, status: r.status, hasSprint: !!r.hasSprint, s: r.schedule || {} }))
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => (a.round || 0) - (b.round || 0));

  // 1. Race times must increase with round. Bahrain's times on Singapore's
  //    document put round 19 before round 18, which this catches on its own.
  for (let i = 1; i < runnable.length; i++) {
    const prev = runnable[i - 1], cur = runnable[i];
    const a = asDate(prev.s.race), b = asDate(cur.s.race);
    if (a && b && b.getTime() <= a.getTime()) {
      problems.push(`round ${cur.round} (${cur.id}) races at ${iso(cur.s.race)}, not after round ${prev.round} (${prev.id}) at ${iso(prev.s.race)}`);
    }
  }

  // 2. No two races within a day of each other. Two races inside one 24h
  //    window is literally what put 1,273 notifications on players.
  for (let i = 1; i < runnable.length; i++) {
    const a = asDate(runnable[i - 1].s.race), b = asDate(runnable[i].s.race);
    if (a && b && Math.abs(b.getTime() - a.getTime()) < DAY) {
      problems.push(`${runnable[i - 1].id} and ${runnable[i].id} race within 24h of each other (${iso(a)} / ${iso(b)}) — both would sit in the same reminder window`);
    }
  }

  for (const r of runnable) {
    // 3. Sessions in order, and all within a few days of the race. A partial
    //    dot-path merge that left one key behind from another meeting shows up
    //    here even when the race time itself looks right.
    //    The running order depends on the format: a sprint weekend is
    //    FP1 / sprint qualifying / sprint / qualifying / race and has no FP2
    //    or FP3, while a normal weekend is FP1 / FP2 / FP3 / qualifying /
    //    race and has no sprint sessions. Comparing one global order flagged
    //    canada_2026 on the first run for holding an FP3 it should not have.
    const expected = r.hasSprint
      ? ['fp1', 'sprintQualifying', 'sprint', 'qualifying', 'race']
      : ['fp1', 'fp2', 'fp3', 'qualifying', 'race'];
    // A race that has already run cannot affect a future lock, so an oddity on
    // one is worth printing but must not fail the check. A check that stays
    // red gets ignored, which is how the status comparison went wrong on the
    // first run of this script.
    const report = r.status === 'completed' ? notes : problems;
    const stray = Object.keys(r.s).filter((k) => asDate(r.s[k]) && !expected.includes(k));
    if (stray.length) {
      report.push(`${r.id} (round ${r.round}, ${r.hasSprint ? 'sprint' : 'normal'} weekend) carries ${stray.join(', ')}, which that format does not run — a leftover key from a different meeting or an earlier format`);
    }
    const order = expected.map((k) => [k, r.s[k]]).filter(([, v]) => asDate(v));
    for (let i = 1; i < order.length; i++) {
      const [pn, pv] = order[i - 1], [cn, cv] = order[i];
      if (asDate(cv).getTime() < asDate(pv).getTime()) {
        report.push(`${r.id}: ${cn} (${iso(cv)}) is before ${pn} (${iso(pv)})`);
      }
    }
    const raceAt = asDate(r.s.race);
    if (raceAt) {
      for (const [name, v] of order) {
        const d = asDate(v);
        if (d && Math.abs(raceAt.getTime() - d.getTime()) > 5 * DAY) {
          report.push(`${r.id}: ${name} at ${iso(v)} is more than 5 days from its race at ${iso(r.s.race)} — looks like another meeting's time`);
        }
      }
    }

    // 4. The keys the lock reads must exist on anything still to be run. A
    //    missing one is a silent unlock, not a visible error: getLockoutTime
    //    reads sprintQualifying, then fp3, then qualifying.
    if (r.status !== 'completed') {
      if (!raceAt) problems.push(`${r.id}: no schedule.race — the Ace lock has nothing to lock on`);
      if (!asDate(r.s.sprintQualifying) && !asDate(r.s.fp3) && !asDate(r.s.qualifying)) {
        problems.push(`${r.id}: none of sprintQualifying/fp3/qualifying is set — teams would never lock for it`);
      }
    }
  }

  // What is next, and when it locks — the question worth asking on a race weekend.
  const now = new Date();
  const upcoming = [...live.entries()]
    .map(([id, r]) => ({ id, round: r.round, status: r.status, hasSprint: !!r.hasSprint, schedule: r.schedule || {} }))
    .filter((r) => r.status !== 'cancelled' && r.status !== 'completed')
    .sort((a, b) => (a.round || 0) - (b.round || 0));
  // Mirrors getNextIncompleteRace in src/utils/lockout.ts, including that a
  // race with no parseable race time counts as next rather than being skipped
  // — that function guards with `if (raceTimeRaw)` and falls through to true.
  // Diverging here would name a different next race than the app locks on, in
  // exactly the broken-data case this script exists to find.
  const next = upcoming.find((r) => { const d = asDate(r.schedule.race); return !d || d.getTime() + 4 * 3600 * 1000 > now.getTime(); });

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

  if (notes.length) {
    console.log(`${notes.length} NOTE(S) on races already run — cannot affect a future lock:`);
    for (const n of notes) console.log(`  - ${n}`);
    console.log('');
  }

  if (problems.length === 0) {
    console.log('OK — the live calendar matches the pinned one on round, status and sprint flag, and ROUND_TO_RACE_ID resolves correctly for every mapped round.');
    process.exit(0);
  }
  console.log(`${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(2); });
