// F-170 repair: scripts/refundStalePenalties.js end to end against the REAL Firestore emulator.
//
// The apply path (one transaction per team, set + mergeFields on a team doc that carries a
// `constructor` object, the snapshot stamps, and the league sync through syncLeaguesForRace) runs
// for real here, so a write shape the SDK refuses at commit (#305) fails a test.
//
// Run with `npm --prefix functions run test:emulator`; CI runs it through scripts/ops/run-rules-tests.sh.
// Never against a real project: without FIRESTORE_EMULATOR_HOST it skips, and the project is a pinned
// demo- id. Its own id, not demo-f171: run-rules-tests.sh runs the emulator files side by side, and
// each file clears its whole project between cases.
const test = require('node:test');
const assert = require('node:assert/strict');

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-f170-refund';
if (!EMU) {
  test('stale-penalty refund on the Firestore emulator', { skip: 'FIRESTORE_EMULATOR_HOST is not set — run `npm run test:emulator`' }, () => {});
  return;
}
if (!PROJECT.startsWith('demo-')) throw new Error(`refusing to run: project ${PROJECT} is not a demo- project`);

// firebase-functions-test first: it sets FIREBASE_CONFIG / GCLOUD_PROJECT for lib/index.js's initializeApp()
require('firebase-functions-test')({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
const admin = require('firebase-admin');
const { syncLeaguesForRace } = require('../../lib/index.js');
const { currentSeason } = require('../../lib/season/current.js');
const { runRefund } = require('../../scripts/refundStalePenalties.js');

const db = admin.firestore();
const { Timestamp } = admin.firestore;
const VEGAS = 'las_vegas_2026';

const ctorObj = (id) => ({ constructorId: id, purchasePrice: 40, currentPrice: 44, contractLength: 3, racesHeld: 2, isReservePick: false, pointsScored: 60 });
const drv = (id) => ({ driverId: id, constructorId: 'x', purchasePrice: 50, currentPrice: 52, contractLength: 3, racesHeld: 2, isReservePick: false, pointsScored: 30 });
const fill = (raceId) => ({ raceId, driverIds: ['lawson'], constructorId: null, cost: 61, at: Timestamp.fromDate(new Date('2026-11-21T03:00:00Z')) });

// snapshots: [raceId, season, round, race points, adjustment?]
const TEAMS = {
  // filled at Vegas, constructor object, penalised at three 2026 races and once in 2025
  tA: { userId: 'u1', leagueId: 'L1', name: 'Abandoned A', totalPoints: 700, lockedPoints: 100, constructor: ctorObj('mclaren'), lastAutoFill: fill(VEGAS),
    snaps: [[VEGAS, '2026', 23, 30, -50], ['brazil_2026', '2026', 22, 20, -45], ['mexico_2026', null, 20, 18, -35], ['abu_dhabi_2025', '2025', 24, 5, -30]],
    refund: 130, vegas: 50 },
  // filled at Vegas, `constructor: null`, one penalty, Moonshot points on the side
  tB: { userId: 'u2', leagueId: 'L1', name: 'Null Ctor', totalPoints: 400, lockedPoints: 0, moonshotPoints: 12, constructor: null, lastAutoFill: fill(VEGAS),
    snaps: [[VEGAS, '2026', 23, 15, -10]], refund: 10, vegas: 10 },
  // an active player: penalised, never auto-filled — untouched
  tC: { userId: 'u3', leagueId: 'L1', name: 'Active', totalPoints: 850, lockedPoints: 0, constructor: ctorObj('ferrari'),
    snaps: [[VEGAS, '2026', 23, 60, -75]], refund: 0, vegas: 0 },
  // filled at Vegas, never penalised
  tD: { userId: 'u4', leagueId: 'L1', name: 'Fresh Fill', totalPoints: 300, lockedPoints: 0, constructor: ctorObj('haas'), lastAutoFill: fill(VEGAS),
    snaps: [[VEGAS, '2026', 23, 44]], refund: 0, vegas: 0 },
  // filled at Vegas, no league; one penalty plus a negative adjustment that is not a stale penalty
  tE: { userId: 'u5', leagueId: null, name: 'Solo', totalPoints: 200, lockedPoints: 0, constructor: ctorObj('williams'), lastAutoFill: fill(VEGAS),
    snaps: [[VEGAS, '2026', 23, 10, -25], ['odd_adjustment_2026', '2026', 21, 3, -7]], refund: 25, vegas: 25 },
};

async function clearEmulator() {
  const res = await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(res.status, 200, `emulator reset failed: ${res.status}`);
}

const memberTotal = (t) => t.totalPoints + t.lockedPoints + (t.moonshotPoints || 0);

async function seed() {
  await clearEmulator();
  const scoredAt = Timestamp.fromDate(new Date('2026-11-22T08:40:00Z'));
  const w = db.batch();
  w.set(db.doc('config/app'), { currentSeason: '2026' });
  w.set(db.doc('races/brazil_2026'), { seasonId: '2026', round: 22, status: 'completed', name: 'São Paulo' });
  w.set(db.doc(`races/${VEGAS}`), { seasonId: '2026', round: 23, status: 'completed', name: 'Las Vegas' });
  w.set(db.doc('races/qatar_2026'), { seasonId: '2026', round: 24, status: 'upcoming', name: 'Qatar' });
  w.set(db.doc('leagues/L1'), { name: 'Paddock Club', ownerId: 'u1', seasonId: '2026', memberCount: 4, raceResultIds: ['brazil_2026', VEGAS] });
  // before the refund the order is u3, u1, u4, u2 (by member total)
  const before = Object.values(TEAMS).filter((t) => t.leagueId).sort((a, b) => memberTotal(b) - memberTotal(a));
  for (const [id, t] of Object.entries(TEAMS)) {
    const ref = db.doc(`fantasyTeams/${id}`);
    const vegasPts = t.snaps.find((s) => s[0] === VEGAS)[3];
    w.set(ref, {
      userId: t.userId, leagueId: t.leagueId, name: t.name, seasonId: '2026', budget: 25,
      drivers: [drv('lawson'), drv('albon')], constructor: t.constructor,
      totalPoints: t.totalPoints, lockedPoints: t.lockedPoints, ...(t.moonshotPoints ? { moonshotPoints: t.moonshotPoints } : {}),
      racesSinceTransfer: 0, scoredRaces: ['brazil_2026', VEGAS], bestRaceId: VEGAS, bestRacePoints: vegasPts,
      ...(t.lastAutoFill ? { lastAutoFill: t.lastAutoFill } : {}),
    });
    for (const [raceId, season, round, points, adjustment] of t.snaps) {
      w.set(ref.collection('raceSnapshots').doc(raceId), {
        teamId: id, userId: t.userId, leagueId: t.leagueId, raceId, ...(season ? { season } : {}), round,
        roster: { drivers: [{ driverId: 'lawson' }, { driverId: 'albon' }], constructor: t.constructor ? { constructorId: t.constructor.constructorId } : null },
        phases: { race: { points, entities: { lawson: points - (adjustment || 0) }, ...(adjustment ? { adjustment } : {}), scoredAt } },
      });
    }
    if (t.leagueId) {
      const rank = before.indexOf(t) + 1;
      w.set(db.doc(`leagues/L1/members/${t.userId}`), {
        userId: t.userId, displayName: `Player ${t.userId}`, teamName: t.name, status: 'approved',
        totalPoints: memberTotal(t), lastRacePoints: vegasPts, lastRaceId: VEGAS, rank, previousRank: rank + 1, previousRankRaceId: VEGAS,
      });
    }
  }
  await w.commit();
}

async function dumpAll() {
  const out = {};
  const walkDoc = async (ref) => {
    const s = await ref.get();
    if (s.exists) out[ref.path] = JSON.parse(JSON.stringify(s.data(), (k, v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
    for (const c of await ref.listCollections()) for (const d of await c.listDocuments()) await walkDoc(d);
  };
  for (const c of await db.listCollections()) for (const d of await c.listDocuments()) await walkDoc(d);
  return out;
}

const data = async (path) => (await db.doc(path).get()).data();
const run = (dryRun, lines = []) => runRefund(db, { dryRun, syncLeagues: syncLeaguesForRace, currentSeason, log: (m) => lines.push(m) });

async function assertRefunded() {
  for (const [id, t] of Object.entries(TEAMS)) {
    const team = await data(`fantasyTeams/${id}`);
    assert.equal(team.totalPoints, t.totalPoints + t.refund, `${id}: totalPoints`);
    assert.equal(team.lockedPoints, t.lockedPoints, `${id}: lockedPoints untouched`);
    assert.deepEqual(team.constructor, t.constructor, `${id}: constructor kept whole`);
    assert.equal(team.drivers.length, 2, `${id}: drivers kept`);
    assert.equal(team.name, t.name, `${id}: unrelated fields kept`);
    assert.equal(team.bestRaceId, VEGAS, `${id}: bestRaceId not moved`);
    assert.equal(team.bestRacePoints, t.snaps.find((s) => s[0] === VEGAS)[3], `${id}: bestRacePoints not moved`);
    for (const [raceId, season, , points, adjustment] of t.snaps) {
      const s = await data(`fantasyTeams/${id}/raceSnapshots/${raceId}`);
      assert.equal(s.phases.race.points, points, `${id}/${raceId}: race points are history`);
      assert.equal(s.phases.race.adjustment, adjustment, `${id}/${raceId}: adjustment is history`);
      const refunded = t.refund > 0 && adjustment && adjustment % 5 === 0 && season !== '2025';
      if (refunded) {
        assert.equal(s.staleRefund.points, -adjustment, `${id}/${raceId}: stamp points`);
        assert.ok(s.staleRefund.at && typeof s.staleRefund.at.toDate === 'function', `${id}/${raceId}: stamp time`);
      } else {
        assert.equal(s.staleRefund, undefined, `${id}/${raceId}: not stamped`);
      }
    }
  }
  // league members follow the team docs and re-rank; lastRacePoints and the movement snapshot stay
  const members = (await db.collection('leagues/L1/members').get()).docs.map((d) => d.data());
  for (const m of members) {
    const t = Object.values(TEAMS).find((x) => x.userId === m.userId);
    assert.equal(m.totalPoints, memberTotal(t) + t.refund, `${m.userId}: member totalPoints`);
    assert.equal(m.lastRacePoints, t.snaps.find((s) => s[0] === VEGAS)[3], `${m.userId}: lastRacePoints unchanged`);
    assert.equal(m.lastRaceId, VEGAS);
    assert.equal(m.previousRankRaceId, VEGAS);
  }
  assert.deepEqual(members.sort((a, b) => a.rank - b.rank).map((m) => m.userId), ['u1', 'u3', 'u2', 'u4'], 'ranks follow the refunded totals');
  // previousRank was already snapshotted for this race (seeded as rank + 1) and is not rewritten
  assert.equal(members.find((m) => m.userId === 'u1').previousRank, 3);
  // the Vegas weekend leaderboard: rewritten by the helper with the same, unrefunded, weekend points
  const lr = await data(`leagues/L1/raceResults/${VEGAS}`);
  for (const e of lr.entries) {
    const t = Object.values(TEAMS).find((x) => x.userId === e.userId);
    assert.equal(e.points, t.snaps.find((s) => s[0] === VEGAS)[3], `${e.userId}: weekend points as scored`);
  }
}

test('dry run: reports the totals and writes nothing', async () => {
  await seed();
  const before = await dumpAll();
  const lines = [];
  const s = await run(true, lines);
  assert.deepEqual(await dumpAll(), before);
  assert.equal(s.teams, 3);
  assert.equal(s.total, 165);
  assert.equal(s.vegas, 85);
  assert.equal(s.vegasTeams, 3);
  assert.deepEqual(s.worst, { teamId: 'tA', name: 'Abandoned A', points: 130, races: 3 });
  assert.deepEqual(s.races.map((r) => [r.raceId, r.points, r.teams]), [['mexico_2026', 35, 1], ['brazil_2026', 45, 1], [VEGAS, 85, 3]]);
  assert.deepEqual(s.unexplained.map((u) => [u.teamId, u.raceId, u.adjustment]), [['tE', 'odd_adjustment_2026', -7]]);
  assert.deepEqual(s.leagues, ['L1']);
  const out = lines.join('\n');
  assert.match(out, /TOTAL refund: \+165 points/);
  assert.match(out, /las_vegas_2026 only: \+85 points across 3 team\(s\)/);
  assert.match(out, /worst team: tA \(Abandoned A\) \+130/);
  const backup = out.match(/backup paths: (.*)/)[1].split(',');
  for (const p of ['fantasyTeams/tA', `fantasyTeams/tA/raceSnapshots/${VEGAS}`, 'fantasyTeams/tA/raceSnapshots/mexico_2026', 'fantasyTeams/tE', 'leagues/L1/members', `leagues/L1/raceResults/${VEGAS}`]) {
    assert.ok(backup.includes(p), `backup lists ${p}`);
  }
  assert.ok(!backup.includes('fantasyTeams/tC') && !backup.includes('fantasyTeams/tD'));
});

test('apply: refunds the Vegas-filled teams, stamps the snapshots and re-syncs the league', async () => {
  await seed();
  const s = await run(false);
  assert.equal(s.total, 165);
  assert.deepEqual(s.synced, ['L1']);
  await assertRefunded();
});

test('apply again: a no-op', async () => {
  await seed();
  await run(false);
  const before = await dumpAll();
  const again = await run(false);
  assert.equal(again.teams, 0);
  assert.equal(again.total, 0);
  assert.deepEqual(again.synced, []);
  assert.deepEqual(await dumpAll(), before);
  await assertRefunded();
});

test('refuses once the season has rolled over', async () => {
  await seed();
  await db.doc('config/app').set({ currentSeason: '2027' });
  const before = await dumpAll();
  await assert.rejects(run(false), /current season is 2027/);
  assert.deepEqual(await dumpAll(), before);
});

test('a team refilled after Vegas is left out, with a warning', async () => {
  await seed();
  await db.doc('fantasyTeams/tB').set({ lastAutoFill: fill('qatar_2026') }, { mergeFields: ['lastAutoFill'] });
  const lines = [];
  const s = await run(false, lines);
  assert.equal(s.total, 155);
  assert.equal((await data('fantasyTeams/tB')).totalPoints, TEAMS.tB.totalPoints);
  assert.match(lines.join('\n'), /WARNING: 1 team\(s\) were auto-filled again after las_vegas_2026 \(qatar_2026: 1\)/);
});
