// F-171: the F-168 race-correction path end to end against the REAL Firestore emulator.
//
// The unit tests (../raceCorrection.test.js) run applyRaceCorrection on a hand-written fake
// Firestore. The fake accepted `tx.update(teamRef, { constructor: … })`, which the real SDK
// refuses at commit ("Can't merge current value into a nested object"), so that bug shipped and
// surfaced only when the production repair op ran (#305). Here every write goes through the real
// firebase-admin SDK into the emulator, so a write shape the SDK or Firestore refuses fails a test.
//
// Run with `npm --prefix functions run test:emulator` (builds, starts the emulator under a demo-
// project via the firebase CLI, runs this directory). CI runs it through `npm run test:rules`
// (scripts/ops/run-rules-tests.sh), on the pinned emulator jar the rules tests already start.
// Never against a real project: without FIRESTORE_EMULATOR_HOST it skips, it refuses a project id
// that is not demo-, and it is not matched by the unit run `node --test test/*.test.js`.
const test = require('node:test');
const assert = require('node:assert/strict');

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-f171';
if (!EMU) {
  test('race correction on the Firestore emulator', { skip: 'FIRESTORE_EMULATOR_HOST is not set — run `npm run test:emulator`' }, () => {});
  return;
}
if (!PROJECT.startsWith('demo-')) throw new Error(`refusing to run: project ${PROJECT} is not a demo- project`);

// firebase-functions-test first: it sets FIREBASE_CONFIG / GCLOUD_PROJECT, which lib/index.js's
// admin.initializeApp() reads. The bucket is only named because two modules call
// admin.storage().bucket() at load time, as they do in production where FIREBASE_CONFIG has it.
const fft = require('firebase-functions-test')({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
const admin = require('firebase-admin');
const functionsIndex = require('../../lib/index.js'); // the deployed entry point: initializes the default app
const { applyRaceCorrection, resultsSignature } = require('../../lib/scoring/raceCorrection.js');
const { buildRaceScoreRows } = require('../../lib/scoring/raceScoreRows.js');
const { syncLeaguesForRace, onRaceCompleted } = functionsIndex;
const { planTeam: planExpirySale, writeRepair: writeExpiryRepair } = require('../../scripts/repairExpirySale.js');

const db = admin.firestore();
const { Timestamp } = admin.firestore;

// ── the race: Las Vegas 2026, Hadjar's post-race time penalty drops him behind Lawson ─────────
const RACE_ID = 'las_vegas_2026';
const TOTAL_LAPS = 50;
const R = (driverId, constructorId, position, gridPosition, extra = {}) => ({ driverId, constructorId, position, gridPosition, status: 'finished', fastestLap: false, laps: TOTAL_LAPS, ...extra });
const scored = [
  R('norris', 'mclaren', 1, 1), R('verstappen', 'red_bull', 2, 2), R('leclerc', 'ferrari', 3, 3), R('piastri', 'mclaren', 4, 4),
  R('hamilton', 'ferrari', 5, 7), R('russell', 'mercedes', 6, 6), R('antonelli', 'mercedes', 7, 10),
  R('hadjar', 'red_bull', 14, 5), R('lawson', 'racing_bulls', 15, 8, { fastestLap: true }), R('lindblad', 'racing_bulls', 16, 9),
  R('alonso', 'aston_martin', 0, 11, { status: 'dnf', laps: 31 }),
];
const official = scored.map((r) => (r.driverId === 'hadjar' ? { ...r, position: 15 } : r.driverId === 'lawson' ? { ...r, position: 14 } : r));
const quali = [
  ['norris', 'mclaren', 1], ['verstappen', 'red_bull', 2], ['leclerc', 'ferrari', 3], ['piastri', 'mclaren', 4], ['hadjar', 'red_bull', 5],
  ['russell', 'mercedes', 6], ['hamilton', 'ferrari', 7], ['lawson', 'racing_bulls', 8], ['lindblad', 'racing_bulls', 9], ['antonelli', 'mercedes', 10], ['alonso', 'aston_martin', 11],
].map(([driverId, constructorId, position]) => ({ driverId, constructorId, position }));
const OLD = { raceResults: scored, qualifyingResults: quali, fastestLap: 'lawson' };
const NEW = { raceResults: official, qualifyingResults: quali, fastestLap: 'lawson' };
// the swap moves exactly two drivers and their two constructors (race component only)
const EXPECTED_DELTA = { hadjar: -3, lawson: 3, red_bull: -2, racing_bulls: 2 };

const ctx = { raceId: RACE_ID, seasonId: '2026', round: 23, totalLaps: TOTAL_LAPS };
const oldRows = new Map(buildRaceScoreRows(scored, null, quali, ctx).map((r) => [r.entityId, r]));
const newRows = new Map(buildRaceScoreRows(official, null, quali, ctx).map((r) => [r.entityId, r]));

// pre-race prices (priceHistory previousPrice): hadjar under the 200 Ace cap, verstappen over it
const PRE = { norris: 214, verstappen: 236, leclerc: 188, piastri: 205, hamilton: 166, russell: 172, antonelli: 92, hadjar: 197, lawson: 61, lindblad: 38, alonso: 94, mclaren: 63, red_bull: 48, ferrari: 41, mercedes: 39, racing_bulls: 30, aston_martin: 29 };
const POST = { ...PRE, hadjar: 204, lawson: 63, racing_bulls: 31, alonso: 56, aston_martin: 14 };
const aceFactor = (id) => (PRE[id] <= 200 ? 2 : 1);

// ── teams ───────────────────────────────────────────────────────────────────────────────────
// snapshot = the roster as fielded (racesHeld BEFORE the race); team = the doc today
const pick = (id, racesHeld, extra = {}) => ({ driverId: id, constructorId: oldRows.get(id).constructorId, purchasePrice: PRE[id] - 4, currentPrice: PRE[id], contractLength: 3, racesHeld, isReservePick: false, ...extra });
const ctor = (id, racesHeld, extra = {}) => ({ constructorId: id, purchasePrice: PRE[id] - 2, currentPrice: PRE[id], contractLength: 3, racesHeld, isReservePick: false, ...extra });

const TEAMS = {
  // tA: full lineup, a constructor object, and an Ace (hadjar, under the cap: ×2)
  tA: { userId: 'u1', name: 'Box Box Box', roster: { drivers: ['hadjar', 'lawson', 'verstappen', 'norris', 'leclerc'].map((d) => pick(d, 1)), constructor: ctor('red_bull', 1), aceDriverId: 'hadjar', aceConstructorId: null },
    team: { drivers: ['hadjar', 'lawson', 'verstappen', 'norris', 'leclerc'].map((d) => ({ ...pick(d, 2), pointsScored: 120 })), constructor: { ...ctor('red_bull', 2), pointsScored: 210 }, totalPoints: 1450, lockedPoints: 300 },
    adjustment: -4, quali: true },
  // tB: `constructor: null` on the snapshot and the team doc; holds lawson
  tB: { userId: 'u2', name: 'Null Ctor', roster: { drivers: [pick('lawson', 0), pick('antonelli', 0)], constructor: null, aceDriverId: null, aceConstructorId: null },
    team: { drivers: [{ ...pick('lawson', 1), pointsScored: 4 }, { ...pick('antonelli', 1), pointsScored: 40 }], constructor: null, totalPoints: 610, lockedPoints: 0 },
    quali: true },
  // tC: hadjar sold since the race (banked → lockedPoints); racing_bulls still held and its Ace (×2)
  tC: { userId: 'u3', name: 'Sold Since', roster: { drivers: [pick('hadjar', 1), pick('piastri', 1)], constructor: ctor('racing_bulls', 0), aceDriverId: null, aceConstructorId: 'racing_bulls' },
    team: { drivers: [{ ...pick('piastri', 2), pointsScored: 88 }, { ...pick('russell', 0), pointsScored: 0 }], constructor: { ...ctor('racing_bulls', 1), pointsScored: 22 }, totalPoints: 900, lockedPoints: 40, moonshotPoints: 6 },
    quali: true },
  // tD: holds neither swapped driver nor their constructors; a stale-roster adjustment
  tD: { userId: 'u4', name: 'Untouched', roster: { drivers: ['verstappen', 'norris', 'piastri', 'russell', 'hamilton'].map((d) => pick(d, 1)), constructor: ctor('mclaren', 1), aceDriverId: 'verstappen', aceConstructorId: null },
    team: { drivers: ['verstappen', 'norris', 'piastri', 'russell', 'hamilton'].map((d) => ({ ...pick(d, 2), pointsScored: 150 })), constructor: { ...ctor('mclaren', 2), pointsScored: 190 }, totalPoints: 1700, lockedPoints: 120 },
    adjustment: -10, quali: true },
};

/** Race/qualifying phase entities as scoring wrote them: neutral points × the Ace factor. */
function phaseEntities(spec, rows, component) {
  const out = {};
  const ace = (id, kind) => (kind === 'driver' ? spec.roster.aceDriverId === id : spec.roster.aceConstructorId === id);
  for (const d of spec.roster.drivers) out[d.driverId] = rows.get(d.driverId)[component] * (ace(d.driverId, 'driver') ? aceFactor(d.driverId) : 1);
  if (spec.roster.constructor) { const c = spec.roster.constructor.constructorId; out[c] = rows.get(c)[component] * (ace(c, 'constructor') ? aceFactor(c) : 1); }
  return out;
}
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
const racePhase = (id, rows = oldRows) => { const e = phaseEntities(TEAMS[id], rows, 'racePoints'); return { entities: e, points: sum(e) + (TEAMS[id].adjustment || 0) }; };
const qualiPhase = (id) => { const e = phaseEntities(TEAMS[id], oldRows, 'qualiPoints'); return { entities: e, points: sum(e) }; };

/** The expected per-pick change for a team (Ace ×2 under the cap). */
function expectedPickDelta(id) {
  const spec = TEAMS[id];
  const out = {};
  const ids = [...spec.roster.drivers.map((d) => d.driverId), ...(spec.roster.constructor ? [spec.roster.constructor.constructorId] : [])];
  for (const e of ids) {
    if (!EXPECTED_DELTA[e]) continue;
    const isAce = spec.roster.aceDriverId === e || spec.roster.aceConstructorId === e;
    out[e] = EXPECTED_DELTA[e] * (isAce ? aceFactor(e) : 1);
  }
  return out;
}
// spelled out, not derived, so a wrong derivation cannot agree with itself
const EXPECTED = {
  tA: { pick: { hadjar: -6, lawson: 3, red_bull: -2 }, total: -5, locked: 0 },
  tB: { pick: { lawson: 3 }, total: 3, locked: 0 },
  tC: { pick: { hadjar: -3, racing_bulls: 4 }, total: 4, locked: -3 },
  tD: { pick: {}, total: 0, locked: 0 },
};

// ── seeding ─────────────────────────────────────────────────────────────────────────────────
async function clearEmulator() {
  const res = await fetch(`http://${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(res.status, 200, `emulator reset failed: ${res.status}`);
}

async function seed() {
  await clearEmulator();
  const scoredAt = Timestamp.fromDate(new Date('2026-11-22T08:40:00Z'));
  const w = db.batch();
  w.set(db.doc('config/app'), { currentSeason: '2026' });
  w.set(db.doc('races/brazil_2026'), { seasonId: '2026', round: 22, status: 'completed', name: 'São Paulo', totalLaps: 71 });
  w.set(db.doc(`races/${RACE_ID}`), {
    seasonId: '2026', round: 23, status: 'completed', name: 'Las Vegas', totalLaps: TOTAL_LAPS,
    qualifyingScored: true, sprintScored: false, results: OLD, scoringCompletedAt: scoredAt,
    schedule: { race: Timestamp.fromDate(new Date('2026-11-22T04:00:00Z')) },
  });
  for (const [entityId, previousPrice] of Object.entries(PRE)) {
    w.set(db.doc(`priceHistory/${RACE_ID}__${entityId}`), { entityId, entityType: oldRows.get(entityId).entityType, price: POST[entityId], previousPrice, change: POST[entityId] - previousPrice, raceId: RACE_ID, timestamp: scoredAt });
  }
  for (const row of oldRows.values()) w.set(db.doc(`raceScores/${RACE_ID}__${row.entityId}`), { ...row, timestamp: scoredAt, seeded: true });

  w.set(db.doc('leagues/L1'), { name: 'Paddock Club', ownerId: 'u1', seasonId: '2026', memberCount: 4, raceResultIds: ['brazil_2026'] });
  for (const [id, spec] of Object.entries(TEAMS)) {
    const race = racePhase(id);
    const teamRef = db.doc(`fantasyTeams/${id}`);
    w.set(teamRef, {
      userId: spec.userId, leagueId: 'L1', name: spec.name, budget: 25, seasonId: '2026',
      aceDriverId: spec.roster.aceDriverId, aceConstructorId: spec.roster.aceConstructorId,
      scoredRaces: ['brazil_2026', RACE_ID], bestRaceId: RACE_ID, bestRacePoints: race.points,
      ...spec.team,
    });
    w.set(teamRef.collection('raceSnapshots').doc(RACE_ID), {
      teamId: id, userId: spec.userId, leagueId: 'L1', raceId: RACE_ID, season: '2026', round: 23,
      roster: { ...spec.roster, budget: 25 },
      phases: {
        race: { ...race, ...(spec.adjustment ? { adjustment: spec.adjustment } : {}), scoredAt },
        ...(spec.quali ? { qualifying: { ...qualiPhase(id), scoredAt } } : {}),
      },
    });
    // the previous round: tA's corrected Las Vegas race drops below it, so its best race moves
    w.set(teamRef.collection('raceSnapshots').doc('brazil_2026'), { raceId: 'brazil_2026', phases: { race: { points: id === 'tA' ? race.points - 2 : 10, entities: {} } } });
    w.set(db.doc(`leagues/L1/members/${spec.userId}`), {
      userId: spec.userId, displayName: `Player ${spec.userId}`, teamName: spec.name, status: 'approved',
      totalPoints: spec.team.totalPoints + spec.team.lockedPoints + (spec.team.moonshotPoints || 0), lastRacePoints: race.points, lastRaceId: RACE_ID, rank: 0,
    });
  }
  // a settled Moonshot on a moved driver: the correction must list it for review, not touch it
  w.set(db.doc('moonshots/m1'), { raceId: RACE_ID, driverId: 'hadjar', teamId: 'tA', userId: 'u1', settledAt: scoredAt, stakeCurrency: 'POINTS', adjustmentAmount: 0 });
  await w.commit();
}

// a plain JSON dump of the whole database (Timestamps as ISO strings), for "nothing changed" checks
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

const raceMeta = async () => (await db.doc(`races/${RACE_ID}`).get()).data();
const data = async (path) => (await db.doc(path).get()).data();

/** Every effect of a correct correction, read back from the emulator. */
async function assertCorrected() {
  const oldSig = resultsSignature(OLD);
  const newSig = resultsSignature(NEW);
  assert.notEqual(oldSig, newSig);
  for (const [id, spec] of Object.entries(TEAMS)) {
    const exp = EXPECTED[id];
    assert.deepEqual(expectedPickDelta(id), exp.pick, `${id}: the spelled-out expectation matches the swap`);
    const team = await data(`fantasyTeams/${id}`);
    assert.equal(team.totalPoints, spec.team.totalPoints + exp.total, `${id}: totalPoints`);
    assert.equal(team.lockedPoints, spec.team.lockedPoints + exp.locked, `${id}: lockedPoints`);
    // picks still held move their pointsScored; others keep theirs
    for (const d of spec.team.drivers) {
      const now = team.drivers.find((x) => x.driverId === d.driverId);
      const held = spec.roster.drivers.some((r) => r.driverId === d.driverId && d.racesHeld >= r.racesHeld + 1);
      assert.equal(now.pointsScored, d.pointsScored + (held ? exp.pick[d.driverId] || 0 : 0), `${id}/${d.driverId}: pointsScored`);
      assert.equal(now.currentPrice, d.currentPrice, `${id}/${d.driverId}: the rest of the pick untouched`);
    }
    if (spec.team.constructor === null) {
      assert.ok(Object.prototype.hasOwnProperty.call(team, 'constructor') && team.constructor === null, `${id}: constructor stays null`);
    } else {
      const c = spec.team.constructor;
      assert.equal(team.constructor.constructorId, c.constructorId);
      assert.equal(team.constructor.pointsScored, c.pointsScored + (exp.pick[c.constructorId] || 0), `${id}: constructor pointsScored`);
      assert.equal(team.constructor.purchasePrice, c.purchasePrice, `${id}: constructor object kept whole`);
    }
    assert.equal(team.name, spec.name, `${id}: unrelated team fields survive the merge`);

    // the snapshot: the race phase moved by the pick deltas (the adjustment kept), stamped with the new signature
    const snap = await data(`fantasyTeams/${id}/raceSnapshots/${RACE_ID}`);
    const before = racePhase(id);
    const entities = { ...before.entities };
    for (const [e, d] of Object.entries(exp.pick)) entities[e] += d;
    assert.deepEqual(snap.phases.race.entities, entities, `${id}: race phase entities`);
    assert.equal(snap.phases.race.points, before.points + sum(exp.pick), `${id}: race phase points`);
    assert.equal(snap.phases.race.adjustment, spec.adjustment, `${id}: race phase adjustment kept`);
    assert.ok(snap.phases.race.scoredAt, `${id}: phase fields not named in the update survive`);
    assert.deepEqual(snap.phases.qualifying.entities, qualiPhase(id).entities, `${id}: qualifying phase untouched`);
    assert.equal(snap.resultsSig, newSig, `${id}: resultsSig stamped`);
    assert.equal(snap.corrections.length, 1, `${id}: one audit entry`);
    assert.deepEqual(snap.corrections[0].delta, exp.pick, `${id}: audit entry delta`);
    assert.equal(snap.roster.constructor === null, spec.roster.constructor === null, `${id}: snapshot roster untouched`);

    // league member: season total from the team doc, this race's points from the corrected snapshot
    const m = await data(`leagues/L1/members/${spec.userId}`);
    assert.equal(m.totalPoints, team.totalPoints + team.lockedPoints + (team.moonshotPoints || 0), `${id}: member totalPoints`);
    assert.equal(m.lastRacePoints, snap.phases.race.points, `${id}: member lastRacePoints`);
    assert.equal(m.lastRaceId, RACE_ID);
    assert.equal(m.moonshotPoints, spec.team.moonshotPoints || 0);
  }
  // best race: tA's Las Vegas race went down below Brazil; the others' Vegas race is still their best
  const tA = await data('fantasyTeams/tA');
  assert.deepEqual([tA.bestRaceId, tA.bestRacePoints], ['brazil_2026', racePhase('tA').points - 2]);
  const tB = await data('fantasyTeams/tB');
  assert.deepEqual([tB.bestRaceId, tB.bestRacePoints], [RACE_ID, racePhase('tB').points + 3]);

  // league ranks: the order of the corrected season totals
  const members = (await db.collection('leagues/L1/members').get()).docs.map((d) => d.data());
  const order = [...members].sort((a, b) => b.totalPoints - a.totalPoints).map((m) => m.userId);
  assert.deepEqual(members.sort((a, b) => a.rank - b.rank).map((m) => m.userId), order, 'members re-ranked');

  // the weekend leaderboard (F-062): weekend points = sum of the corrected snapshot phases
  const lr = await data(`leagues/L1/raceResults/${RACE_ID}`);
  assert.ok(lr, 'league race result written');
  for (const [id, spec] of Object.entries(TEAMS)) {
    const entry = lr.entries.find((e) => e.userId === spec.userId);
    assert.equal(entry.points, racePhase(id).points + sum(EXPECTED[id].pick) + qualiPhase(id).points, `${id}: weekend leaderboard points`);
  }
  assert.ok((await data('leagues/L1')).raceResultIds.includes(RACE_ID));

  // raceScores: exactly the four moved rows rewritten with the corrected breakdown, the rest untouched
  const rows = (await db.collection('raceScores').get()).docs.map((d) => d.data());
  const rewritten = rows.filter((r) => !r.seeded).map((r) => r.entityId).sort();
  assert.deepEqual(rewritten, Object.keys(EXPECTED_DELTA).sort());
  for (const r of rows) {
    const { timestamp, seeded, ...fields } = r;
    assert.deepEqual(fields, JSON.parse(JSON.stringify(newRows.get(r.entityId))), `raceScores/${r.entityId}`);
  }
  assert.equal(rows.find((r) => r.entityId === 'lawson').position, 14);
  assert.equal(rows.find((r) => r.entityId === 'hadjar').position, 15);
  // prices are a market already traded on: never rewound
  assert.equal((await data(`priceHistory/${RACE_ID}__hadjar`)).price, POST.hadjar);
}

const opts = (extra = {}) => ({ dryRun: false, log: () => {}, syncLeagues: syncLeaguesForRace, ...extra });

// ── (a) the correction, applied ────────────────────────────────────────────────────────────
test('(a) applyRaceCorrection moves every team by exactly its per-pick delta and syncs the league', async () => {
  await seed();
  const s = await applyRaceCorrection(db, RACE_ID, await raceMeta(), OLD, NEW, opts());
  assert.equal(s.refused, undefined);
  assert.deepEqual(Object.fromEntries(Object.entries(s.entityDeltas).map(([k, v]) => [k, v.race])), EXPECTED_DELTA);
  assert.deepEqual(s.teams.map((t) => [t.teamId, t.activeDelta, t.bankedDelta]).sort(), [['tA', -5, 0], ['tB', 3, 0], ['tC', 4, -3]]);
  assert.deepEqual(s.leaguesSynced, ['L1']);
  assert.deepEqual(s.moonshotsToReview, ['m1']);
  assert.deepEqual(s.aceUnknown, []);
  await assertCorrected();
  // tD moved nothing but is stamped, so a redelivery skips it too
  assert.equal((await data(`fantasyTeams/tD/raceSnapshots/${RACE_ID}`)).resultsSig, resultsSignature(NEW));
});

// ── (b) idempotent ─────────────────────────────────────────────────────────────────────────
test('(b) running the correction again changes no team, snapshot or league', async () => {
  await seed();
  await applyRaceCorrection(db, RACE_ID, await raceMeta(), OLD, NEW, opts());
  // raceScores rows are rewritten on every run (same fields, a new server timestamp): see the F-171 spec
  const ignoreRowStamp = (path, k) => path.startsWith('raceScores/') && k === 'timestamp';
  const before = await dumpAll(ignoreRowStamp);
  const again = await applyRaceCorrection(db, RACE_ID, await raceMeta(), OLD, NEW, opts());
  assert.equal(again.teams.length, 0);
  assert.equal(again.skippedAlreadyCorrected, 4);
  assert.deepEqual(again.leaguesSynced, []);
  assert.deepEqual(await dumpAll(ignoreRowStamp), before);
  await assertCorrected();
});

// ── (c) dry run ────────────────────────────────────────────────────────────────────────────
test('(c) the dry run reports the changes and writes nothing', async () => {
  await seed();
  const before = await dumpAll();
  const s = await applyRaceCorrection(db, RACE_ID, await raceMeta(), OLD, NEW, opts({ dryRun: true }));
  assert.deepEqual(s.teams.map((t) => [t.teamId, t.activeDelta, t.bankedDelta]).sort(), [['tA', -5, 0], ['tB', 3, 0], ['tC', 4, -3]]);
  assert.equal(s.rows, 4);
  assert.deepEqual(await dumpAll(), before);
});

// ── (d) a team deleted between the list and its transaction ────────────────────────────────
test('(d) a team doc deleted after the team list was read is not recreated', async () => {
  await seed();
  // the real db, except that listing fantasyTeams deletes tA (the team with a constructor) right
  // after the list is read: the window a user deleting their team mid-correction falls in
  const racy = new Proxy(db, {
    get(target, prop) {
      if (prop === 'collection') {
        return (name) => {
          const c = target.collection(name);
          if (name !== 'fantasyTeams') return c;
          return new Proxy(c, { get(ct, p) {
            if (p === 'get') return async () => { const list = await ct.get(); await ct.doc('tA').delete(); return list; };
            const v = ct[p]; return typeof v === 'function' ? v.bind(ct) : v;
          } });
        };
      }
      const v = target[prop]; return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const s = await applyRaceCorrection(racy, RACE_ID, await raceMeta(), OLD, NEW, opts());
  assert.equal((await db.doc('fantasyTeams/tA').get()).exists, false, 'no partial team doc');
  assert.deepEqual(s.teams.map((t) => t.teamId).sort(), ['tB', 'tC']);
  // its snapshot (which outlives the team) is left alone
  assert.equal((await data(`fantasyTeams/tA/raceSnapshots/${RACE_ID}`)).resultsSig, undefined);
  // the other teams were still corrected
  assert.equal((await data('fantasyTeams/tB')).totalPoints, TEAMS.tB.team.totalPoints + 3);
  assert.equal((await data('fantasyTeams/tC')).lockedPoints, TEAMS.tC.team.lockedPoints - 3);
});

// ── (e) the deployed trigger ───────────────────────────────────────────────────────────────
test('(e) the onRaceCompleted trigger applies a changed classification to the teams', async () => {
  await seed();
  const ref = `races/${RACE_ID}`;
  const beforeData = await raceMeta();
  const afterData = { ...beforeData, results: NEW };
  await db.doc(ref).set(afterData); // the write that fires the trigger in production
  const change = fft.makeChange(fft.firestore.makeDocumentSnapshot(beforeData, ref), fft.firestore.makeDocumentSnapshot(afterData, ref));
  const wrapped = fft.wrap(onRaceCompleted);
  // the trigger swallows a correction error into the log, so capture the log and fail on it
  const errors = [];
  const orig = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); };
  try {
    await wrapped(change, { params: { raceId: RACE_ID } });
  } finally {
    console.error = orig;
  }
  assert.deepEqual(errors, [], 'the trigger logged no error');
  await assertCorrected();
  // the same event delivered again (at-least-once delivery) is a no-op
  const totals = await Promise.all(Object.keys(TEAMS).map(async (id) => (await data(`fantasyTeams/${id}`)).totalPoints));
  await wrapped(change, { params: { raceId: RACE_ID } });
  assert.deepEqual(await Promise.all(Object.keys(TEAMS).map(async (id) => (await data(`fantasyTeams/${id}`)).totalPoints)), totals);
});

// ── (f) the expiry-sale repair's transaction write ─────────────────────────────────────────
test('(f) repairExpirySale: planTeam + its transaction write commit for a team with a constructor', async () => {
  await seed();
  // aston_martin's contract ran out at Las Vegas and was sold at the pre-race 29; alonso likewise at 94
  const teamRef = db.doc('fantasyTeams/tX');
  const snapRef = teamRef.collection('raceSnapshots').doc(RACE_ID);
  await teamRef.set({ userId: 'u9', leagueId: null, name: 'Expired', budget: 140, totalPoints: 300, lockedPoints: 0,
    drivers: [{ ...pick('norris', 1), pointsScored: 30 }], constructor: { ...ctor('mclaren', 0), pointsScored: 0, currentPrice: 60 } });
  await snapRef.set({ raceId: RACE_ID, roster: { drivers: [pick('alonso', 2), pick('norris', 0)], constructor: ctor('aston_martin', 2), aceDriverId: null, aceConstructorId: null } });
  const team = await data('fantasyTeams/tX');
  const plan = planExpirySale(await data(snapRef.path), team, (id) => POST[id], (id) => POST[id]);
  assert.deepEqual(plan.sold.map((x) => [x.id, x.delta]), [['alonso', -38], ['aston_martin', -15]]);
  assert.equal(plan.constructor.constructorId, 'mclaren');
  await db.runTransaction(async (tx) => {
    const teamDoc = await tx.get(teamRef);
    await tx.get(snapRef);
    writeExpiryRepair(tx, teamDoc, snapRef, plan);
  });
  const after = await data('fantasyTeams/tX');
  assert.equal(after.budget, 140 - 53);
  assert.equal(after.constructor.currentPrice, POST.mclaren, 'the constructor object written whole, repriced');
  assert.equal(after.constructor.pointsScored, 0);
  assert.equal(after.name, 'Expired', 'unrelated fields kept');
  const s = await data(snapRef.path);
  assert.equal(s.expirySaleRepair.budgetDelta, -53);
  assert.ok(s.roster, 'snapshot fields kept');
});

test.after(() => fft.cleanup());
