// F-170 repair: scripts/refundStalePenalties.js end to end against the REAL Firestore emulator.
//
// The apply path (one transaction per team, set + mergeFields on a team doc that carries a
// `constructor` object, the snapshot stamps, the team's staleRefund record for reconstructed races,
// and the league sync through syncLeaguesForRace) runs for real here, so a write shape the SDK
// refuses at commit (#305) fails a test.
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

const IDS = ['australia', 'china', 'japan', 'bahrain', 'saudi', 'miami', 'imola', 'monaco', 'spain', 'canada', 'austria', 'britain', 'belgium', 'hungary',
  'netherlands', 'italy', 'madrid', 'baku', 'singapore', 'usa', 'mexico', 'brazil', 'las_vegas'].map((x) => `${x}_2026`);
const RID = (round) => IDS[round - 1];
const VEGAS = 'las_vegas_2026';
const ALL_SCORED = [...IDS, ...IDS.map((id) => `quali_${id}`), 'sprint_miami_2026'];

const ctorObj = (id) => ({ constructorId: id, purchasePrice: 40, currentPrice: 44, contractLength: 3, racesHeld: 2, isReservePick: false, pointsScored: 60 });
const drv = (id, extra = {}) => ({ driverId: id, constructorId: 'x', purchasePrice: 50, currentPrice: 52, contractLength: 3, racesHeld: 2, isReservePick: false, pointsScored: 30, ...extra });
const fill = (raceId) => ({ raceId, driverIds: ['lawson'], constructorId: null, cost: 61, at: Timestamp.fromDate(new Date('2026-11-21T03:00:00Z')) });
const pen = (counter) => (counter > 5 ? -(counter - 5) * 5 : 0);
/** [round, adjustment] for rounds from..to, the counter running up from `c` */
const runOf = (from, to, c) => Array.from({ length: to - from + 1 }, (_, i) => [from + i, pen(c + i)]);

const TEAMS = {
  // filled at Vegas (confirmed), constructor object, counter 14 at R17 → 20 at Vegas: penalised from R9
  tA: { userId: 'u1', leagueId: 'L1', name: 'Abandoned A', totalPoints: 700, lockedPoints: 100, constructor: ctorObj('mclaren'), lastAutoFill: fill(VEGAS), vegasFill: true, rst: 21, rstAfter: 1,
    snaps: runOf(17, 23, 14), extra: [['abu_dhabi_2025', '2025', 24, -30]], snapshot: 420, recon: 180, vegas: 75 },
  // filled at Vegas (confirmed), `constructor: null`, counter 0 at R17 → only Vegas penalised
  tB: { userId: 'u2', leagueId: 'L1', name: 'Null Ctor', totalPoints: 400, lockedPoints: 0, moonshotPoints: 12, constructor: null, lastAutoFill: fill(VEGAS), vegasFill: true, rst: 7, rstAfter: 1,
    snaps: runOf(17, 23, 0), snapshot: 5, recon: 0, vegas: 5 },
  // an active player: penalised, never auto-filled — untouched
  tC: { userId: 'u3', leagueId: 'L1', name: 'Active', totalPoints: 850, lockedPoints: 0, constructor: ctorObj('ferrari'), vegasFill: false, rst: 21, rstAfter: 21,
    snaps: runOf(17, 23, 14), snapshot: 0, recon: 0, vegas: 0 },
  // filled at Vegas (confirmed), never penalised, and has transferred since (counter 0 stays 0)
  tD: { userId: 'u4', leagueId: 'L1', name: 'Fresh Fill', totalPoints: 300, lockedPoints: 0, constructor: ctorObj('haas'), lastAutoFill: fill(VEGAS), vegasFill: true, rst: 0, rstAfter: 0,
    snaps: runOf(17, 23, 0).map(([r]) => [r, 0]), snapshot: 0, recon: 0, vegas: 0 },
  // filled at Vegas (confirmed), no league; R22 carries a negative adjustment that is not a stale penalty
  tE: { userId: 'u5', leagueId: null, name: 'Solo', totalPoints: 200, lockedPoints: 0, constructor: ctorObj('williams'), lastAutoFill: fill(VEGAS), vegasFill: true, rst: 11, rstAfter: 1,
    snaps: [[22, -7], [23, -25]], snapshot: 25, recon: 0, vegas: 25 },
  // a FORGED stamp (written by the client before the rules fix): Lawson is the player's own Vegas
  // purchase, so the snapshot does not confirm a fill — nothing, though it was penalised
  tF: { userId: 'u6', leagueId: 'L1', name: 'Forger', totalPoints: 600, lockedPoints: 0, constructor: ctorObj('alpine'), lastAutoFill: fill(VEGAS), vegasFill: false, rst: 21, rstAfter: 21,
    snaps: runOf(17, 23, 14), snapshot: 0, recon: 0, vegas: 0 },
  // filled at Vegas, then its lastAutoFill moved on (as a Qatar refill would): the snapshot keeps it in
  tG: { userId: 'u7', leagueId: null, name: 'Refilled', totalPoints: 150, lockedPoints: 0, constructor: ctorObj('sauber'), lastAutoFill: fill('qatar_2026'), vegasFill: true, rst: 10, rstAfter: 1,
    snaps: runOf(17, 23, 3), snapshot: 50, recon: 0, vegas: 20 },
};
const refundOf = (t) => t.snapshot + t.recon;

async function clearEmulator() {
  const res = await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(res.status, 200, `emulator reset failed: ${res.status}`);
}

const memberTotal = (t) => t.totalPoints + t.lockedPoints + (t.moonshotPoints || 0);
const racePoints = (adj) => 150 + adj;

async function seed() {
  await clearEmulator();
  const scoredAt = Timestamp.fromDate(new Date('2026-11-22T08:40:00Z'));
  const w = db.batch();
  w.set(db.doc('config/app'), { currentSeason: '2026' });
  // Vegas stores its season as a number: the lookups must find it either way
  // a race every 14 days from 8 March: R8 (14 June) is the first on or after 2026-06-13
  IDS.forEach((id, i) => w.set(db.doc(`races/${id}`), { seasonId: id === VEGAS ? 2026 : '2026', round: i + 1, status: 'completed', name: id,
    schedule: { race: Timestamp.fromMillis(Date.UTC(2026, 2, 8) + i * 14 * 86400000) } }));
  w.set(db.doc('races/qatar_2026'), { seasonId: '2026', round: 24, status: 'upcoming', name: 'Qatar' });
  w.set(db.doc('races/abu_dhabi_2025'), { seasonId: '2025', round: 24, status: 'completed', name: 'Abu Dhabi 2025' });
  w.set(db.doc('leagues/L1'), { name: 'Paddock Club', ownerId: 'u1', seasonId: '2026', memberCount: 5, raceResultIds: [VEGAS] });
  const before = Object.values(TEAMS).filter((t) => t.leagueId).sort((a, b) => memberTotal(b) - memberTotal(a));
  for (const [id, t] of Object.entries(TEAMS)) {
    const ref = db.doc(`fantasyTeams/${id}`);
    const vegasAdj = t.snaps.find((s) => s[0] === 23)[1];
    w.set(ref, {
      userId: t.userId, leagueId: t.leagueId, name: t.name, seasonId: '2026', budget: 25,
      drivers: [drv('lawson', { racesHeld: 1 }), drv('albon')], constructor: t.constructor,
      totalPoints: t.totalPoints, lockedPoints: t.lockedPoints, ...(t.moonshotPoints ? { moonshotPoints: t.moonshotPoints } : {}),
      racesSinceTransfer: t.rst, scoredRaces: ALL_SCORED, bestRaceId: VEGAS, bestRacePoints: racePoints(vegasAdj),
      ...(t.lastAutoFill ? { lastAutoFill: t.lastAutoFill } : {}),
    });
    const rows = [...t.snaps.map(([round, adj]) => [RID(round), '2026', round, adj]), ...(t.extra || [])];
    for (const [raceId, season, round, adj] of rows) {
      const lawson = raceId === VEGAS ? (t.vegasFill ? { racesHeld: 0, isReservePick: true } : { racesHeld: 0, isReservePick: false }) : { racesHeld: 3, isReservePick: false };
      w.set(ref.collection('raceSnapshots').doc(raceId), {
        teamId: id, userId: t.userId, leagueId: t.leagueId, raceId, season, round,
        roster: { drivers: [{ driverId: 'lawson', ...lawson }, { driverId: 'albon', racesHeld: 5, isReservePick: false }], constructor: t.constructor ? { constructorId: t.constructor.constructorId, racesHeld: 5, isReservePick: false } : null },
        phases: { race: { points: racePoints(adj), entities: { lawson: 100, albon: 50 }, ...(adj ? { adjustment: adj } : {}), scoredAt } },
      });
    }
    if (t.leagueId) {
      const rank = before.indexOf(t) + 1;
      w.set(db.doc(`leagues/L1/members/${t.userId}`), {
        userId: t.userId, displayName: `Player ${t.userId}`, teamName: t.name, status: 'approved',
        totalPoints: memberTotal(t), lastRacePoints: racePoints(vegasAdj), lastRaceId: VEGAS, rank, previousRank: rank + 1, previousRankRaceId: VEGAS,
      });
    }
  }
  await w.commit();
}

/** Plain JSON of the whole database; `omit(path, key)` drops fields that legitimately move (server timestamps). */
async function dumpAll(omit = () => false) {
  const out = {};
  const walkDoc = async (ref) => {
    const s = await ref.get();
    if (s.exists) out[ref.path] = JSON.parse(JSON.stringify(s.data(), (k, v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)));
    for (const c of await ref.listCollections()) for (const d of await c.listDocuments()) await walkDoc(d);
  };
  for (const c of await db.listCollections()) for (const d of await c.listDocuments()) await walkDoc(d);
  for (const [path, data] of Object.entries(out)) for (const k of Object.keys(data)) if (omit(path, k)) delete data[k];
  return out;
}
// the league sync rewrites the weekend leaderboard's updatedAt on every run (same numbers)
const ignoreLeaderboardStamp = (path, k) => path.startsWith('leagues/L1/raceResults/') && k === 'updatedAt';

const data = async (path) => (await db.doc(path).get()).data();
const run = (dryRun, lines = []) => runRefund(db, { dryRun, syncLeagues: syncLeaguesForRace, currentSeason, log: (m) => lines.push(m) });

async function assertRefunded() {
  for (const [id, t] of Object.entries(TEAMS)) {
    const team = await data(`fantasyTeams/${id}`);
    assert.equal(team.totalPoints, t.totalPoints + refundOf(t), `${id}: totalPoints`);
    assert.equal(team.lockedPoints, t.lockedPoints, `${id}: lockedPoints untouched`);
    assert.deepEqual(team.constructor, t.constructor, `${id}: constructor kept whole`);
    assert.equal(team.drivers.length, 2, `${id}: drivers kept`);
    assert.equal(team.name, t.name, `${id}: unrelated fields kept`);
    assert.equal(team.racesSinceTransfer, t.rstAfter, `${id}: racesSinceTransfer`);
    assert.equal(team.bestRaceId, VEGAS, `${id}: bestRaceId not moved`);
    assert.equal(team.bestRacePoints, racePoints(t.snaps.find((s) => s[0] === 23)[1]), `${id}: bestRacePoints not moved`);
    if (t.rst !== t.rstAfter || refundOf(t)) assert.equal(team.staleRefund.counterBefore, t.rst, `${id}: counter before the reset recorded`);
    if (t.recon) {
      assert.equal(team.staleRefund.total, t.recon, `${id}: reconstructed total recorded`);
      assert.deepEqual(Object.keys(team.staleRefund.races).sort(), [9, 10, 11, 12, 13, 14, 15, 16].map(RID).sort(), `${id}: reconstructed races recorded`);
      assert.equal(team.staleRefund.races[RID(9)], 5);
      assert.equal(team.staleRefund.races[RID(16)], 40);
      assert.ok(typeof team.staleRefund.at.toDate === 'function');
    } else if (t.rst === t.rstAfter && !refundOf(t)) {
      assert.equal(team.staleRefund, undefined, `${id}: untouched team, no record`);
    } else {
      assert.equal(team.staleRefund.total, 0, `${id}: no reconstructed races`);
    }
    const refunded = t.snapshot > 0;
    for (const [round, adj] of t.snaps) {
      const s = await data(`fantasyTeams/${id}/raceSnapshots/${RID(round)}`);
      assert.equal(s.phases.race.points, racePoints(adj), `${id}/R${round}: race points are history`);
      assert.equal(s.phases.race.adjustment, adj || undefined, `${id}/R${round}: adjustment is history`);
      if (refunded && adj < 0 && adj % 5 === 0) assert.equal(s.staleRefund.points, -adj, `${id}/R${round}: stamp`);
      else assert.equal(s.staleRefund, undefined, `${id}/R${round}: not stamped`);
    }
  }
  assert.equal((await data('fantasyTeams/tA/raceSnapshots/abu_dhabi_2025')).staleRefund, undefined, '2025 never refunded');
  // league members follow the team docs and re-rank; lastRacePoints and the movement snapshot stay
  const members = (await db.collection('leagues/L1/members').get()).docs.map((d) => d.data());
  for (const m of members) {
    const t = Object.values(TEAMS).find((x) => x.userId === m.userId);
    assert.equal(m.totalPoints, memberTotal(t) + refundOf(t), `${m.userId}: member totalPoints`);
    assert.equal(m.lastRacePoints, racePoints(t.snaps.find((s) => s[0] === 23)[1]), `${m.userId}: lastRacePoints unchanged`);
    assert.equal(m.lastRaceId, VEGAS);
    assert.equal(m.previousRankRaceId, VEGAS);
  }
  assert.deepEqual(members.sort((a, b) => a.rank - b.rank).map((m) => m.userId), ['u1', 'u3', 'u6', 'u2', 'u4'], 'ranks follow the refunded totals');
  assert.equal(members.find((m) => m.userId === 'u1').previousRank, 3, 'previousRank (seeded rank + 1) not re-snapshotted');
  const lr = await data(`leagues/L1/raceResults/${VEGAS}`);
  for (const e of lr.entries) {
    const t = Object.values(TEAMS).find((x) => x.userId === e.userId);
    assert.equal(e.points, racePoints(t.snaps.find((s) => s[0] === 23)[1]), `${e.userId}: weekend points as scored`);
  }
}

test('dry run: reports both kinds of refund, the gaps and the forged team, and writes nothing', async () => {
  await seed();
  const before = await dumpAll();
  const lines = [];
  const s = await run(true, lines);
  assert.deepEqual(await dumpAll(), before);
  assert.equal(s.teams, 4);
  assert.deepEqual([s.total, s.snapshotTotal, s.reconTotal], [680, 500, 180]);
  assert.equal(s.vegas, 125);
  assert.equal(s.vegasTeams, 4);
  assert.equal(s.eligible, 5);
  assert.equal(s.counterResets, 4);
  assert.deepEqual([s.crossChecked, s.crossCheckPassed], [1, 1]);
  assert.equal(s.refilled, 1);
  assert.deepEqual(s.worst, { teamId: 'tA', name: 'Abandoned A', points: 600, races: 15 });
  assert.deepEqual(s.ineligible.map((x) => x.teamId), ['tF']);
  assert.deepEqual(s.unexplained.map((u) => [u.teamId, u.raceId, u.adjustment]), [['tE', RID(22), -7]]);
  assert.equal(s.latestRaceId, VEGAS, 'found with a numeric seasonId');
  assert.deepEqual(s.leagues, ['L1']);
  assert.deepEqual(s.races.find((r) => r.round === 9), { raceId: RID(9), round: 9, snapshot: 0, reconstructed: 5, teams: 1 });
  assert.deepEqual(s.races.find((r) => r.round === 23), { raceId: VEGAS, round: 23, snapshot: 125, reconstructed: 0, teams: 4 });
  const out = lines.join('\n');
  assert.match(out, /TOTAL refund: \+680 points/);
  assert.match(out, /from snapshots \(recorded penalties\): +\+500/);
  assert.match(out, /reconstructed from the counter: +\+180/);
  assert.match(out, /las_vegas_2026 only: \+125 points across 4 team\(s\)/);
  assert.match(out, /counter reset to 1 \(the F-170 value\): 4 team\(s\)/);
  assert.match(out, /near-end counter cross-check: 1 of 1 team\(s\) with a penalised first snapshot passed/);
  assert.match(out, / {2}tA: totalPoints 700 → 1300 \(\+600; .*\); counter 21 → 1/);
  assert.match(out, / {2}tB: [^\n]*counter 7 → 1/);
  assert.match(out, /worst team: tA \(Abandoned A\) \+600/);
  assert.match(out, /INELIGIBLE[^\n]*\n {2}tF: lawson is not an auto-filled pick/);
  assert.match(out, /GAP[^\n]*\n(.*\n)*? {2}tA: 2 race\(s\): R1 R2 \(before the last transfer\)/);
  assert.match(out, / {2}tB: 16 race\(s\): R1 .* R16 \(first snapshot shows no counter to count back from\)/);
  const backup = out.match(/backup paths: (.*)/)[1].split(',');
  for (const p of ['fantasyTeams/tA', `fantasyTeams/tA/raceSnapshots/${VEGAS}`, `fantasyTeams/tA/raceSnapshots/${RID(17)}`, 'fantasyTeams/tE', 'leagues/L1/members', `leagues/L1/raceResults/${VEGAS}`]) {
    assert.ok(backup.includes(p), `backup lists ${p}`);
  }
  for (const p of ['fantasyTeams/tC', 'fantasyTeams/tD', 'fantasyTeams/tF']) assert.ok(!backup.includes(p), `backup leaves out ${p}`);
  assert.ok(backup.includes('fantasyTeams/tG'));
});

test('apply: refunds the confirmed Vegas-filled teams, records and stamps, re-syncs the league', async () => {
  await seed();
  const s = await run(false);
  assert.equal(s.total, 680);
  assert.deepEqual(s.synced, ['L1']);
  await assertRefunded();
});

test('apply again: no team, snapshot or member moves', async () => {
  await seed();
  await run(false);
  const before = await dumpAll(ignoreLeaderboardStamp);
  const again = await run(false);
  assert.deepEqual([again.teams, again.total], [0, 0]);
  assert.deepEqual(await dumpAll(ignoreLeaderboardStamp), before);
  await assertRefunded();
});

test('a run that died before the league sync is finished by the next run', async () => {
  await seed();
  await run(false);
  // as if the first run had died after the team transactions: members still on the old totals
  const w = db.batch();
  for (const t of Object.values(TEAMS).filter((x) => x.leagueId)) w.set(db.doc(`leagues/L1/members/${t.userId}`), { totalPoints: memberTotal(t) }, { merge: true });
  await w.commit();
  assert.equal((await data('leagues/L1/members/u1')).totalPoints, 800);
  const again = await run(false);
  assert.equal(again.total, 0, 'nothing refunded twice');
  assert.deepEqual(again.synced, ['L1'], 'the league is re-synced anyway');
  await assertRefunded();
});

test('refuses once the season has rolled over', async () => {
  await seed();
  await db.doc('config/app').set({ currentSeason: '2027' });
  const before = await dumpAll();
  await assert.rejects(run(false), /current season is 2027/);
  assert.deepEqual(await dumpAll(), before);
});

test('once a race after Vegas has completed: --apply refuses, the dry run warns', async () => {
  await seed();
  await db.doc('races/qatar_2026').set({ status: 'completed' }, { merge: true });
  const before = await dumpAll();
  await assert.rejects(run(false), /refusing --apply: a race after las_vegas_2026 has completed \(qatar_2026\)/);
  assert.deepEqual(await dumpAll(), before, 'nothing written');
  const lines = [];
  await run(true, lines);
  assert.match(lines.join('\n'), /WARNING \*\*\* a race after las_vegas_2026 has completed/);
  assert.deepEqual(await dumpAll(), before);
});
