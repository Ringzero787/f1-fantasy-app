// F-168: a corrected classification applied to an already-scored race.
// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRaceScoreRows } = require('../lib/scoring/raceScoreRows.js');
const { resultsSignature, componentDeltas, changedRows, planTeamCorrection } = require('../lib/scoring/raceCorrection.js');
const { planTeam: planExpirySale } = require('../scripts/repairExpirySale.js');

const R = (driverId, constructorId, position, gridPosition, extra = {}) => ({ driverId, constructorId, position, gridPosition, status: 'finished', fastestLap: false, laps: 50, ...extra });
const ctx = { raceId: 'las_vegas_2026', seasonId: '2026', round: 23, totalLaps: 50 };
const rows = (race) => buildRaceScoreRows(race, null, null, ctx);

// Las Vegas 2026: Hadjar (Red Bull, grid 5) scored 14th, then a time penalty put Lawson (Racing Bulls, grid 8) ahead
const scored = [R('verstappen', 'red_bull', 1, 2), R('hadjar', 'red_bull', 14, 5), R('lawson', 'racing_bulls', 15, 8, { fastestLap: true }), R('lindblad', 'racing_bulls', 16, 9)];
const official = [R('verstappen', 'red_bull', 1, 2), R('lawson', 'racing_bulls', 14, 8, { fastestLap: true }), R('hadjar', 'red_bull', 15, 5), R('lindblad', 'racing_bulls', 16, 9)];
const deltas = componentDeltas(rows(scored), rows(official));

test('the Las Vegas swap moves exactly the two drivers and their two constructors', () => {
  assert.deepEqual(Object.fromEntries([...deltas].map(([k, v]) => [k, v.race])), { hadjar: -3, lawson: 3, red_bull: -2, racing_bulls: 2 });
  assert.equal(changedRows(rows(scored), rows(official)).length, 4);
  assert.equal(componentDeltas(rows(scored), rows(scored)).size, 0);
});

test('resultsSignature ignores row order and sees any scored field', () => {
  assert.equal(resultsSignature({ raceResults: scored }), resultsSignature({ raceResults: [...scored].reverse() }));
  assert.notEqual(resultsSignature({ raceResults: scored }), resultsSignature({ raceResults: official }));
  assert.notEqual(resultsSignature({ raceResults: scored }), resultsSignature({ raceResults: scored, fastestLap: 'lawson' }));
  // the repair script corrects the teams with `corrected`, then writes its fields onto the stored
  // results; the trigger then sees the merged document and must compute the same signature, or it
  // would apply the correction a second time
  const stored = { raceResults: scored, qualifyingResults: [{ driverId: 'hadjar', constructorId: 'red_bull', position: 5 }], fastestLap: 'lawson', other: 'kept' };
  const corrected = { raceResults: official, qualifyingResults: stored.qualifyingResults, fastestLap: 'lawson' };
  assert.equal(resultsSignature({ ...stored, ...corrected }), resultsSignature(corrected));
});

const snap = (over = {}) => ({
  roster: { drivers: [{ driverId: 'hadjar', racesHeld: 1 }, { driverId: 'lawson', racesHeld: 1 }], constructor: { constructorId: 'red_bull', racesHeld: 0 }, aceDriverId: 'hadjar', aceConstructorId: null, ...over.roster },
  phases: { race: { entities: { hadjar: 15, lawson: 8, red_bull: 83 }, points: 106 }, qualifying: { entities: { hadjar: 8, lawson: 3, red_bull: 9 }, points: 20 }, ...over.phases },
});
const team = (over = {}) => ({ drivers: [{ driverId: 'hadjar', racesHeld: 2, pointsScored: 30 }, { driverId: 'lawson', racesHeld: 2, pointsScored: 20 }], constructor: { constructorId: 'red_bull', racesHeld: 1, pointsScored: 92 }, totalPoints: 500, ...over });
const under = () => 197; // Hadjar's pre-race price: under the 200 cap

test('a valid Ace doubles the change; picks still held move totalPoints and pointsScored', () => {
  const p = planTeamCorrection(snap(), team(), deltas, under);
  assert.deepEqual(p.entityDelta, { hadjar: -6, lawson: 3, red_bull: -2 });
  assert.deepEqual(p.phases.race.entities, { hadjar: 9, lawson: 11, red_bull: 81 });
  assert.equal(p.phases.race.points, 101);
  assert.equal(p.racePhaseDelta, -5);
  assert.equal(p.activeDelta, -5);
  assert.equal(p.bankedDelta, 0);
  assert.equal(p.drivers.find((d) => d.driverId === 'hadjar').pointsScored, 24);
  assert.equal(p.constructor.pointsScored, 90);
  assert.equal(p.phases.qualifying, undefined, 'a race-only correction leaves the qualifying phase alone');
});

test('an Ace over the price cap at scoring time was scored ×1 and is corrected ×1; no price on record is reported', () => {
  assert.equal(planTeamCorrection(snap(), team(), deltas, () => 204).entityDelta.hadjar, -3);
  const unknown = planTeamCorrection(snap(), team(), deltas, () => undefined);
  assert.equal(unknown.entityDelta.hadjar, -3);
  assert.deepEqual(unknown.aceUnknown, ['hadjar']);
});

test('a pick sold or expired since the race has its change banked into lockedPoints', () => {
  const sold = team({ drivers: [{ driverId: 'lawson', racesHeld: 2, pointsScored: 20 }] });
  const p = planTeamCorrection(snap(), sold, deltas, under);
  assert.equal(p.bankedDelta, -6);
  assert.equal(p.activeDelta, 1);
  // bought again after the race: a new contract (racesHeld 0), so the old points are banked too
  const again = team({ drivers: [{ driverId: 'hadjar', racesHeld: 0, pointsScored: 0 }, { driverId: 'lawson', racesHeld: 2, pointsScored: 20 }] });
  const q = planTeamCorrection(snap(), again, deltas, under);
  assert.equal(q.bankedDelta, -6);
  assert.equal(q.drivers.find((d) => d.driverId === 'hadjar').pointsScored, 0);
});

test('a qualifying correction lands in the qualifying phase when it was scored standalone, else in the race phase', () => {
  const qd = new Map([['hadjar', { race: 0, quali: -1, sprint: 0 }]]);
  const standalone = planTeamCorrection(snap(), team(), qd, under);
  assert.equal(standalone.phases.qualifying.entities.hadjar, 6);
  assert.equal(standalone.racePhaseDelta, 0);
  const atRace = planTeamCorrection(snap({ phases: { qualifying: undefined } }), team(), qd, under);
  assert.equal(atRace.phases.race.entities.hadjar, 13);
  assert.equal(atRace.racePhaseDelta, -2);
  // qualifying was scored on its own, but this team has no qualifying phase: it joined after
  // Saturday and the race run gave it no qualifying points either, so it gets no correction
  assert.equal(planTeamCorrection(snap({ phases: { qualifying: undefined } }), team(), qd, under, { quali: true, sprint: false }), null);
  // a pick bought between qualifying and the race was not in the qualifying phase: no change
  const bought = snap({ phases: { qualifying: { entities: { lawson: 3, red_bull: 9 }, points: 12 } } });
  assert.equal(planTeamCorrection(bought, team(), qd, under, { quali: true, sprint: false }), null);
});

test('a sprint correction: its own phase when scored on Saturday, the race phase otherwise; never for a constructor', () => {
  const sd = new Map([['lawson', { race: 0, quali: 0, sprint: 2 }], ['red_bull', { race: 0, quali: 0, sprint: 5 }]]);
  const own = planTeamCorrection(snap({ phases: { sprint: { entities: { hadjar: 4, lawson: 1 }, points: 5 } } }), team(), sd, under, { quali: true, sprint: true });
  assert.deepEqual(own.phases.sprint.entities, { hadjar: 4, lawson: 3 });
  assert.equal(own.racePhaseDelta, 0);
  assert.deepEqual(own.entityDelta, { lawson: 2 });
  const folded = planTeamCorrection(snap(), team(), sd, under, { quali: true, sprint: false });
  assert.equal(folded.phases.race.entities.lawson, 10);
});

test('a team the correction does not touch, a constructor sprint delta, and a team doc without a constructor', () => {
  assert.equal(planTeamCorrection(snap({ roster: { drivers: [{ driverId: 'verstappen', racesHeld: 1 }], constructor: null, aceDriverId: null } }), team(), deltas, under), null);
  assert.equal(planTeamCorrection(snap(), team(), new Map([['red_bull', { race: 0, quali: 0, sprint: 4 }]]), under), null);
  const noCtor = { drivers: team().drivers, totalPoints: 1 }; // no `constructor` key: must not read Object's own constructor
  const p = planTeamCorrection(snap(), noCtor, deltas, under);
  assert.equal(p.constructor, null);
  assert.equal(p.bankedDelta, -2); // red_bull is no longer held
});

test('expiry sale repair: an expired pick sold at the pre-race price is re-credited at the post-race price', () => {
  const s = { roster: { drivers: [{ driverId: 'verstappen', racesHeld: 2, contractLength: 3, currentPrice: 608 }, { driverId: 'norris', racesHeld: 0, contractLength: 3, currentPrice: 592 }], constructor: { constructorId: 'aston_martin', racesHeld: 2, contractLength: 3, currentPrice: 29 } } };
  const t = { drivers: [{ driverId: 'norris', racesHeld: 1, currentPrice: 592 }], constructor: null, budget: 625 };
  const post = { verstappen: 655, aston_martin: 14, norris: 600 };
  const p = planExpirySale(s, t, (id) => post[id], (id) => post[id]);
  assert.deepEqual(p.sold.map((x) => [x.id, x.delta]), [['verstappen', 47], ['aston_martin', -15]]);
  assert.equal(p.budgetDelta, 32);
  assert.equal(p.drivers[0].currentPrice, 600, 'the remaining roster gets the market price back');
  // a pick that did not race has no post-race price: it was sold at the right price
  assert.equal(planExpirySale(s, t, () => undefined, () => undefined).sold.length, 0);
});

// ── applyRaceCorrection end to end, against a small in-memory Firestore ──────────────────────
const { applyRaceCorrection } = require('../lib/scoring/raceCorrection.js');

function fakeDb(seed) {
  const docs = new Map(Object.entries(JSON.parse(JSON.stringify(seed))));
  const isFV = (v) => v && typeof v === 'object' && v.constructor && /FieldValue|Transform/.test(v.constructor.name);
  const setPath = (obj, key, val) => { const parts = key.split('.'); let o = obj; parts.slice(0, -1).forEach((k) => { o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}; o = o[k]; }); o[parts[parts.length - 1]] = val; };
  const apply = (path, data, merge) => {
    const cur = merge ? JSON.parse(JSON.stringify(docs.get(path) || {})) : {};
    for (const [k, v] of Object.entries(data)) {
      if (isFV(v)) { if (/arrayUnion/i.test(JSON.stringify(v)) || v.elements || v._elements) { const el = v.elements || v._elements || []; const arr = (k.split('.').reduce((o, x) => (o || {})[x], cur) || []).concat(el); setPath(cur, k, arr); } else setPath(cur, k, 'TS'); continue; }
      setPath(cur, k, v instanceof Object && v.toDate ? 'TS' : v);
    }
    docs.set(path, cur);
  };
  const snapOf = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), ref: ref(path), data: () => (docs.has(path) ? JSON.parse(JSON.stringify(docs.get(path))) : undefined) });
  function ref(path) {
    return {
      path, id: path.split('/').pop(),
      get: async () => snapOf(path),
      update: async (d) => apply(path, d, true),
      set: async (d, o) => apply(path, d, !!(o && o.merge)),
      collection: (c) => collection(`${path}/${c}`),
    };
  }
  function collection(cpath, filters = []) {
    const depth = cpath.split('/').length + 1;
    return {
      doc: (id) => ref(`${cpath}/${id}`),
      where: (f, op, v) => collection(cpath, [...filters, [f, op, v]]),
      get: async () => ({
        docs: [...docs.keys()].filter((k) => k.startsWith(`${cpath}/`) && k.split('/').length === depth)
          .filter((k) => filters.every(([f, op, v]) => op === '==' && docs.get(k)[f] === v)).map(snapOf),
      }),
    };
  }
  return {
    docs,
    collection: (c) => collection(c),
    batch: () => { const ops = []; return { set: (r, d) => ops.push(() => apply(r.path, d, false)), commit: async () => ops.forEach((f) => f()) }; },
    runTransaction: async (fn) => { const ops = []; const tx = { get: (r) => r.get(), update: (r, d) => ops.push(() => apply(r.path, d, true)) }; const out = await fn(tx); ops.forEach((f) => f()); return out; },
  };
}

const vegasSeed = () => ({
  'races/r22': { seasonId: '2026', round: 22, status: 'completed' },
  'races/las_vegas_2026': { seasonId: '2026', round: 23, status: 'completed' },
  'priceHistory/las_vegas_2026__hadjar': { raceId: 'las_vegas_2026', entityId: 'hadjar', previousPrice: 197, price: 204 },
  'fantasyTeams/t1': { leagueId: 'L1', userId: 'u1', totalPoints: 500, bestRaceId: 'las_vegas_2026', bestRacePoints: 106, ...team() },
  'fantasyTeams/t1/raceSnapshots/las_vegas_2026': snap(),
  'fantasyTeams/t1/raceSnapshots/r22': { phases: { race: { points: 104 } } },
  'fantasyTeams/t2': { leagueId: 'L1', userId: 'u2', totalPoints: 300, drivers: [{ driverId: 'verstappen', racesHeld: 2, pointsScored: 60 }], constructor: null },
  'fantasyTeams/t2/raceSnapshots/las_vegas_2026': { roster: { drivers: [{ driverId: 'verstappen', racesHeld: 1 }], constructor: null }, phases: { race: { entities: { verstappen: 73 }, points: 73 } } },
});
const raceMeta = { seasonId: '2026', round: 23, totalLaps: 50, name: 'Las Vegas', qualifyingScored: true };

test('applyRaceCorrection: dry run writes nothing and reports every change', async () => {
  const db = fakeDb(vegasSeed());
  const before = JSON.stringify([...db.docs]);
  const s = await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: scored }, { raceResults: official }, { dryRun: true, log: () => {} });
  assert.equal(JSON.stringify([...db.docs]), before);
  assert.deepEqual(s.teams.map((t) => [t.teamId, t.activeDelta]), [['t1', -5]]);
  assert.equal(s.rows, 4);
});

test('applyRaceCorrection: applies once, then a redelivery or the repair script\'s own write is a no-op', async () => {
  const db = fakeDb(vegasSeed());
  const synced = [];
  const opts = { dryRun: false, log: () => {}, syncLeagues: async (id, race, updates) => { synced.push(updates); return ['L1']; } };
  const s = await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: scored }, { raceResults: official }, opts);
  const t1 = db.docs.get('fantasyTeams/t1');
  assert.equal(t1.totalPoints, 495);
  assert.equal(t1.drivers.find((d) => d.driverId === 'hadjar').pointsScored, 24);
  assert.equal(t1.bestRaceId, 'r22', 'the best race went down below another race');
  assert.equal(t1.bestRacePoints, 104);
  const snap1 = db.docs.get('fantasyTeams/t1/raceSnapshots/las_vegas_2026');
  assert.equal(snap1.phases.race.points, 101);
  assert.equal(snap1.corrections.length, 1);
  assert.equal(db.docs.get('fantasyTeams/t2').totalPoints, 300, 'an untouched team keeps its points');
  assert.equal(db.docs.get('raceScores/las_vegas_2026__lawson').position, 14);
  assert.deepEqual(synced[0].map((u) => [u.userId, u.points]).sort(), [['u1', 101], ['u2', 73]], 'lastRacePoints from every team in the league');
  assert.deepEqual(s.leaguesSynced, ['L1']);
  // the same event again (redelivery), and the merged write the repair script makes
  const again = await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: scored }, { raceResults: official }, opts);
  assert.equal(again.teams.length, 0);
  assert.equal(db.docs.get('fantasyTeams/t1').totalPoints, 495);
  // a late event for the OLD version (A→B arriving after B→C) does not land on top
  const third = [...official].map((r) => (r.driverId === 'verstappen' ? { ...r, status: 'dsq', position: 0 } : r));
  await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: official }, { raceResults: third }, opts);
  const late = await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: scored }, { raceResults: official }, opts);
  assert.equal(late.skippedOutOfOrder, 2);
});

test('applyRaceCorrection refuses an empty classification and a race older than the latest scored one', async () => {
  const db = fakeDb(vegasSeed());
  assert.match((await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: scored }, { raceResults: [] }, { dryRun: false, log: () => {} })).refused, /no race classification/);
  db.docs.set('races/abu_dhabi_2026', { seasonId: '2026', round: 24, status: 'completed' });
  assert.match((await applyRaceCorrection(db, 'las_vegas_2026', raceMeta, { raceResults: scored }, { raceResults: official }, { dryRun: false, log: () => {} })).refused, /later race/);
  assert.equal(db.docs.get('fantasyTeams/t1').totalPoints, 500);
});

test('applyRaceCorrection scores the old rows with the lap count they were scored with', async () => {
  const db = fakeDb(vegasSeed());
  const dnf = (laps) => [R('hadjar', 'red_bull', 0, 5, { status: 'dnf', laps: 25 }), ...scored.filter((r) => r.driverId !== 'hadjar')];
  // same classification, only the lap count was fixed: nothing moves for the teams
  const s = await applyRaceCorrection(db, 'las_vegas_2026', { ...raceMeta, totalLaps: 50 }, { raceResults: dnf() }, { raceResults: dnf() }, { dryRun: true, log: () => {} }, 40);
  assert.ok(s.entityDeltas.hadjar, 'a different lap count changes a DNF penalty');
  const same = await applyRaceCorrection(db, 'las_vegas_2026', { ...raceMeta, totalLaps: 50 }, { raceResults: dnf() }, { raceResults: dnf() }, { dryRun: true, log: () => {} }, 50);
  assert.equal(same.changed, false);
});

// ── Phase 3.5 contract expiry (F-168): pinned in the source, the trigger cannot run here ─────
test('contract expiry sells at the post-race price and keeps negative banked points', () => {
  const fs = require('fs');
  const cp = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'scoring', 'calculatePoints.ts'), 'utf8').replace(/\r/g, '');
  const expiry = cp.slice(cp.indexOf('PHASE 3.5'), cp.indexOf('PHASE 4'));
  assert.match(expiry, /currentPrice: driverPrices\.get\(d\.driverId\) \|\| d\.currentPrice/);
  assert.match(expiry, /currentPrice: ctorPrices\.get\(ctorBeforeRefresh\.constructorId\) \|\| ctorBeforeRefresh\.currentPrice/);
  assert.match(expiry, /saleReturns \+= driver\.currentPrice/);
  assert.match(expiry, /lockedPoints: lockedPoints !== 0 \? lockedPoints/);
  assert.ok(!/lockedPoints > 0 \?/.test(expiry));
  assert.match(cp, /scoringCompletedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\)/);
});
