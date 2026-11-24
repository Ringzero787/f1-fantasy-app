// Runs with the unit suite: `npm --prefix functions run build && node --test functions/test/*.test.js`.
//
// F-170 repair: the planning half of scripts/refundStalePenalties.js — which teams (confirmed from
// the server-written snapshot), which snapshot adjustments are stale penalties, and the penalties
// reconstructed from the counter before the first snapshot. The writes are proven on the emulator
// (test/emulator/staleRefund.emu.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../scripts/refundStalePenalties.js');
const { buildRaceSnapshot } = require('../lib/scoring/raceSnapshots.js');
const { calculateDriverPoints, calculateLockBonus, RACE_POINTS, GRID_SIZE } = require('../lib/scoring/scoringCore.js');

// rounds 1..23 of 2026; Vegas is 23
const IDS = ['australia', 'china', 'japan', 'bahrain', 'saudi', 'miami', 'imola', 'monaco', 'spain', 'canada', 'austria', 'britain', 'belgium', 'hungary',
  'netherlands', 'italy', 'madrid', 'baku', 'singapore', 'usa', 'mexico', 'brazil', 'las_vegas'].map((x) => `${x}_2026`);
// a race every 14 days from 8 March: round 7 runs 31 May, round 8 on 14 June (the first after 2026-06-13)
const DAY = 86400000;
const RACES = new Map(IDS.map((id, i) => [id, { round: i + 1, status: 'completed', raceMs: Date.UTC(2026, 2, 8) + i * 14 * DAY }]));
const RID = (round) => IDS[round - 1];
const VEGAS = 'las_vegas_2026';

const fill = { raceId: VEGAS, driverIds: ['lawson'], constructorId: null, cost: 61 };
const team = (extra = {}) => ({ name: 'Abandoned', totalPoints: 500, lastAutoFill: fill, scoredRaces: [], ...extra });
const roster = (vegasFill = true) => ({
  drivers: [{ driverId: 'norris', racesHeld: 4, isReservePick: false }, { driverId: 'lawson', racesHeld: vegasFill ? 0 : 3, isReservePick: vegasFill }],
  constructor: { constructorId: 'mclaren', racesHeld: 4, isReservePick: false },
});
/** A race-phase snapshot whose adjustment is consistent (points − Σentities). */
const snap = (round, adjustment, extra = {}) => ({
  id: RID(round),
  data: { raceId: RID(round), season: '2026', round, roster: roster(RID(round) === VEGAS),
    phases: { race: { points: 400 + (adjustment || 0), entities: { norris: 250, mclaren: 150 }, ...(adjustment !== undefined ? { adjustment } : {}) } }, ...extra },
});
/** Snapshots for rounds from..to, each penalised by the counter that ran from `counterAtFrom`. */
const run = (from, to, counterAtFrom) => {
  const out = [];
  for (let r = from; r <= to; r++) { const c = counterAtFrom + (r - from); out.push(snap(r, c > 5 ? -(c - 5) * 5 : undefined)); }
  return out;
};
const scoredThrough = (n, extra = []) => [...IDS.slice(0, n), ...IDS.slice(0, n).map((id) => `quali_${id}`), `sprint_${RID(6)}`, ...extra];
const plan = (t, snaps, races = RACES) => R.planTeamRefund(t, snaps, races);
/** The Vegas snapshot of a team the sweep did NOT fill there (lawson held from before). */
const notFilled = (s) => (s.id === VEGAS ? { ...s, data: { ...s.data, roster: roster(false) } } : s);

// ── who ──────────────────────────────────────────────────────────────────────────────────────
test('in scope: a fill on the server-written Vegas snapshot, or lastAutoFill naming Vegas', () => {
  const snaps = [snap(23, -50)];
  assert.equal(plan({ totalPoints: 9 }, snaps.map(notFilled)), null, 'no fill on the snapshot, no stamp');
  assert.equal(plan({ totalPoints: 9 }, []), null);
  assert.equal(plan(team({ lastAutoFill: VEGAS }), snaps.map(notFilled)), null, 'a malformed stamp is not a fill');
  // refilled at Qatar (the stamp moved on) or never stamped: the snapshot keeps the team in
  assert.equal(plan(team({ lastAutoFill: { ...fill, raceId: 'qatar_2026' } }), snaps).snapshotPoints, 50);
  assert.equal(plan(team({ lastAutoFill: null }), snaps).snapshotPoints, 50);
  assert.equal(plan(team(), snaps).snapshotPoints, 50);
  assert.equal(R.snapshotShowsFill({ roster: { drivers: [], constructor: { constructorId: 'haas', racesHeld: 0, isReservePick: true } } }), true, 'a constructor fill counts');
  assert.equal(R.snapshotShowsFill({ roster: { drivers: [{ driverId: 'x', racesHeld: 1, isReservePick: true }] } }), false, 'held from an earlier race');
});

test('a forged lastAutoFill (client-written before the rules fix) is not confirmed by the Vegas snapshot', () => {
  const ownBuy = [{ ...snap(23, -50), data: { ...snap(23, -50).data, roster: roster(false) } }];
  ownBuy[0].data.roster.drivers[1] = { driverId: 'lawson', racesHeld: 0, isReservePick: false }; // bought by the player for Vegas
  const p = plan(team(), ownBuy);
  assert.equal(p.eligible, false);
  assert.match(p.ineligibleWhy, /lawson is not an auto-filled pick/);
  assert.equal(p.points, 0);
  assert.equal(plan(team(), [snap(22, -45)]).ineligibleWhy, `no ${VEGAS} snapshot to confirm the fill`);
  assert.match(plan(team({ lastAutoFill: { ...fill, driverIds: [] } }), [snap(23, -50)]).ineligibleWhy, /names no pick/);
  assert.equal(plan(team(), [snap(23, -50)].map(notFilled)).ineligibleWhy, 'lawson is not an auto-filled pick on the las_vegas_2026 roster');
  // a driver held from before (racesHeld 3) is not this fill's pick even if flagged reserve
  const held = snap(23, -50); held.data.roster.drivers[1] = { driverId: 'lawson', racesHeld: 3, isReservePick: true };
  assert.equal(plan(team(), [held]).eligible, false);
  // the constructor, when the fill names one, must be the auto-filled constructor
  assert.match(plan(team({ lastAutoFill: { ...fill, constructorId: 'mclaren' } }), [snap(23, -50)]).ineligibleWhy, /mclaren is not the auto-filled constructor/);
  const ctorFill = snap(23, -50); ctorFill.data.roster.constructor = { constructorId: 'haas', racesHeld: 0, isReservePick: true };
  assert.equal(plan(team({ lastAutoFill: { ...fill, constructorId: 'haas' } }), [ctorFill]).eligible, true);
  // R.summarize lists them
  const s = R.summarize([{ teamId: 'f', plan: p }]);
  assert.deepEqual(s.ineligible, [{ teamId: 'f', why: p.ineligibleWhy }]);
  assert.equal(s.teams, 0);
});

// ── which snapshot adjustments ─────────────────────────────────────────────────────────────────
test('only negative race-phase adjustments shaped like a stale penalty; the rest is reported', () => {
  const dup = snap(18, -15); dup.data.roster.drivers.push({ driverId: 'norris' });
  const p = plan(team(), [
    snap(23, -10),
    snap(17, 15), // positive: never a penalty, not reported either
    { id: RID(19), data: { season: '2026', round: 19, phases: { qualifying: { points: -10, adjustment: -10 }, sprint: { points: 0, adjustment: -5 }, race: { points: 12, entities: { x: 12 } } } } },
    { id: RID(20), data: { season: '2026', round: 20, phases: { race: { points: 0, entities: { x: Number.NaN }, adjustment: Number.NaN } } } },
    { id: RID(21), data: { season: '2026', round: 21, phases: { race: { points: 0, entities: {}, adjustment: '-30' } } } },
    { id: RID(22), data: { season: '2026', round: 22, phases: { race: { points: 33, entities: { x: 40 }, adjustment: -10 } } } }, // points − Σ ≠ adjustment
    dup,
  ]);
  assert.deepEqual(p.snapshotRefunds.map((r) => r.raceId), [VEGAS]);
  assert.deepEqual(p.unexplained.map((u) => [u.round, u.why]).sort((a, b) => a[0] - b[0]), [
    [18, 'roster lists a driver twice'],
    [20, 'non-finite adjustment (a coerced scoring run)'],
    [21, 'non-finite adjustment (a coerced scoring run)'],
    [22, 'adjustment is not points − Σentities'],
  ]);
  const odd = plan(team(), [snap(23, -7)]);
  assert.equal(odd.points, 0);
  assert.equal(odd.unexplained[0].why, 'not a multiple of 5');
});

test('2026 only: season field first, the race id for snapshots without one', () => {
  assert.equal(R.isSeasonSnapshot('x_2026', {}), true);
  assert.equal(R.isSeasonSnapshot('x_2025', {}), false);
  assert.equal(R.isSeasonSnapshot('x_2026', { season: '2025' }), false, 'the field wins over the id');
  assert.equal(R.isSeasonSnapshot('x', { season: 2026 }), true);
  assert.equal(R.isSeasonSnapshot('x', { seasonId: '2026' }), true);
  const p = plan(team(), [snap(23, -10), { ...snap(22, -45), id: 'abu_dhabi_2025', data: { ...snap(22, -45).data, season: '2025' } }]);
  assert.deepEqual(p.snapshotRefunds.map((r) => r.raceId), [VEGAS]);
});

// ── the real scoring code's snapshots ──────────────────────────────────────────────────────────
/** Phase 1 for one team, as calculatePoints.ts does it, into buildRaceSnapshot. */
function scoreRace(t, results, { coerce = false } = {}) {
  let teamPoints = 0;
  const driversAfter = t.drivers.map((d) => {
    const r = results.find((x) => x.driverId === d.driverId);
    let pts = r ? calculateDriverPoints(r, null, d.racesHeld, d.driverId === t.aceDriverId, { totalLaps: 50, round: 23, seasonId: '2026' }) : 0;
    if (coerce && d.driverId === 'norris') pts = Number.NaN; // legacy-damaged roster data
    teamPoints += pts;
    return { ...d, pointsScored: (d.pointsScored || 0) + pts, racesHeld: d.racesHeld + 1 };
  });
  const c = t.constructor;
  let cp = 0;
  for (const r of results.filter((x) => x.constructorId === c.constructorId && x.status === 'finished')) cp += RACE_POINTS[r.position - 1] + (GRID_SIZE + 1 - r.position);
  if (t.aceConstructorId === c.constructorId) cp *= 2;
  cp += calculateLockBonus(c.racesHeld);
  teamPoints += cp;
  const ctorAfter = { ...c, pointsScored: (c.pointsScored || 0) + cp, racesHeld: c.racesHeld + 1 };
  const penalty = t.racesSinceTransfer > 5 ? (t.racesSinceTransfer - 5) * 5 : 0;
  teamPoints -= penalty;
  if (!Number.isFinite(teamPoints)) teamPoints = 0; // the coercion backstop
  return { penalty, data: buildRaceSnapshot({ teamId: 'tX', team: t, constructorBefore: c, raceId: VEGAS, season: '2026', round: 23, phase: 'race', teamPoints, driversAfter, constructorAfter: ctorAfter, scoredAt: 'T' }) };
}
const RESULTS = [
  { driverId: 'norris', constructorId: 'mclaren', position: 1, gridPosition: 1, status: 'finished', fastestLap: true, laps: 50 },
  { driverId: 'piastri', constructorId: 'mclaren', position: 4, gridPosition: 3, status: 'finished', fastestLap: false, laps: 50 },
  { driverId: 'lawson', constructorId: 'racing_bulls', position: 9, gridPosition: 12, status: 'finished', fastestLap: false, laps: 50 },
];
const realTeam = (extra = {}) => ({
  userId: 'u', drivers: [{ driverId: 'norris', racesHeld: 7, pointsScored: 200, isReservePick: false }, { driverId: 'lawson', racesHeld: 0, pointsScored: 0, isReservePick: true }],
  constructor: { constructorId: 'mclaren', racesHeld: 9, pointsScored: 300, isReservePick: false },
  aceDriverId: 'norris', aceConstructorId: null, racesSinceTransfer: 17, ...extra,
});

test('a snapshot built by the real buildRaceSnapshot: Ace, lock bonus, constructor and a stale penalty', () => {
  const { penalty, data } = scoreRace(realTeam(), RESULTS);
  assert.equal(penalty, 60);
  assert.equal(data.phases.race.adjustment, -60, 'the adjustment is exactly the penalty');
  assert.ok(calculateLockBonus(7) > 0 && calculateLockBonus(9) > 0, 'lock bonuses are in play');
  const a = R.analyzeSnapshot(data);
  assert.deepEqual([a.kind, a.points, a.counter], ['stale', 60, 17]);
  const p = plan(team(), [{ id: VEGAS, data }]);
  assert.deepEqual(p.snapshotRefunds.map((r) => [r.raceId, r.points]), [[VEGAS, 60]]);
  // and no penalty at all: no adjustment
  const clean = scoreRace(realTeam({ racesSinceTransfer: 3 }), RESULTS).data;
  assert.equal(clean.phases.race.adjustment, undefined);
  assert.equal(R.analyzeSnapshot(clean).kind, 'zero');
});

test('a coerced non-finite run (teamPoints forced to 0) is never refunded', () => {
  const { data } = scoreRace(realTeam(), RESULTS, { coerce: true });
  // calculatePoints stores 0 points; buildRaceSnapshot reads the NaN pointsScored as 0, so the
  // entities stay finite and the adjustment is exactly −Σentities, a negative multiple of 5 here
  const r = data.phases.race;
  const entitySum = Object.values(r.entities).reduce((s, v) => s + v, 0);
  assert.equal(r.points, 0);
  assert.ok(Object.values(r.entities).every(Number.isFinite));
  assert.equal(r.adjustment, -entitySum);
  // whatever its shape, the points-0 check stops it (checked last, so it is the reason given when the
  // adjustment is otherwise penalty-shaped)
  const shaped = { ...data, phases: { race: { ...r, points: 0, entities: { norris: -200, lawson: 30, mclaren: 230 }, adjustment: -60 } } };
  assert.match(R.analyzeSnapshot(shaped).why, /race points are 0/);
  const a = R.analyzeSnapshot(data);
  assert.equal(a.kind, 'unexplained');
  const p = plan(team(), [{ id: VEGAS, data }]);
  assert.equal(p.points, 0);
  assert.equal(r.adjustment, 36, 'here the lost entity (norris read as −200) leaves a positive adjustment');
  assert.equal(a.why, 'positive adjustment');
  // a non-finite value that does reach the snapshot is never stale either
  const nan = { ...data, phases: { race: { ...r, points: 5, entities: { ...r.entities, norris: Number.NaN }, adjustment: -60 } } };
  assert.equal(R.analyzeSnapshot(nan).kind, 'unexplained');
});

// ── reconstruction before the first snapshot ────────────────────────────────────────────────────
test('reconstruction: a team penalised from round 9 (counter 20 at Vegas, last transfer before round 3)', () => {
  // counter before round r = r - 3, so the penalty starts at round 9 (counter 6) and is 75 at round 23
  const t = team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 21 });
  const p = plan(t, run(17, 23, 14));
  assert.deepEqual(p.crossCheck, { expected: 21, actual: 21, ok: true });
  assert.deepEqual(p.counter, { before: 21, after: 1 });
  assert.deepEqual(p.snapshotRefunds.map((r) => [r.round, r.points]), [[17, 45], [18, 50], [19, 55], [20, 60], [21, 65], [22, 70], [23, 75]]);
  assert.deepEqual(p.reconstructed.map((r) => [r.round, r.points, r.counter]), [[9, 5, 6], [10, 10, 7], [11, 15, 8], [12, 20, 9], [13, 25, 10], [14, 30, 11], [15, 35, 12], [16, 40, 13]]);
  assert.equal(p.reconPoints, 180);
  assert.equal(p.snapshotPoints, 420);
  assert.equal(p.vegasPoints, 75);
  assert.deepEqual(p.gap.map((g) => [g.round, g.why]), [[1, 'before the last transfer'], [2, 'before the last transfer']]);
  assert.deepEqual(p.staleRefund, { races: Object.fromEntries(p.reconstructed.map((r) => [r.raceId, r.points])), total: 180, counterBefore: 21 });
  const s = R.summarize([{ teamId: 't', name: 'T', plan: p }]);
  assert.deepEqual([s.total, s.snapshotTotal, s.reconTotal, s.vegas], [600, 420, 180, 75]);
  assert.deepEqual(s.races.find((r) => r.round === 9), { raceId: RID(9), round: 9, snapshot: 0, reconstructed: 5, teams: 1 });
  assert.deepEqual(s.races.find((r) => r.round === 23), { raceId: VEGAS, round: 23, snapshot: 75, reconstructed: 0, teams: 1 });
});

test('reconstruction walks only the races the team was scored in (a missed race is not counted)', () => {
  // joined at round 4, not scored at round 8: scored races 4..7, 9..23 → counter 18 at Vegas (anchor 17: 12)
  const t = team({ scoredRaces: [...IDS.slice(3, 7), ...IDS.slice(8, 23)], racesSinceTransfer: 19 });
  const p = plan(t, run(17, 23, 12));
  // counter 12 at round 17 → 11 at 16 … 6 at 11, 5 at 10, … 0 at 4
  assert.deepEqual(p.reconstructed.map((r) => [r.round, r.counter]), [[11, 6], [12, 7], [13, 8], [14, 9], [15, 10], [16, 11]]);
  assert.deepEqual(p.gap, []);
});

test('a transfer between snapshots: snapshot refunds kept; the near-end cross-check stops the reconstruction', () => {
  // counter 7 at 17, 8 at 18; a transfer before 19 → 0..4 at 19..23 and 5 today
  const p = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 5 }), [...run(17, 18, 7), ...run(19, 23, 0)]);
  assert.deepEqual(p.snapshotRefunds.map((r) => [r.round, r.points]), [[17, 10], [18, 15]]);
  assert.deepEqual(p.reconstructed, [], 'the latest penalty (R18) does not lead to today\'s counter: refused');
  assert.deepEqual(p.crossCheck, { expected: 14, actual: 5, ok: false });
  assert.match(p.unexplained[0].why, /racesSinceTransfer is 5, the snapshots imply 14/);
  assert.deepEqual(p.counter, { before: 5, after: 1 }, 'still reset to the F-170 value');
  // a transfer long enough ago to be penalised again: 6 at 17; transfer before 18
  const later = plan(team({ scoredRaces: scoredThrough(23) }), [snap(17, -10), ...run(18, 23, 0)]);
  assert.deepEqual(later.snapshotRefunds.map((r) => r.round), [17]);
  assert.equal(R.countersAgree({ kind: 'zero' }, { kind: 'stale', counter: 6 }, 1), true, 'counter 5 then 6');
  assert.equal(R.countersAgree({ kind: 'zero' }, { kind: 'stale', counter: 9 }, 1), false, 'counter ≤5 cannot reach 9 in one race');
});

test('near-end cross-check mismatch: no reconstruction, both numbers reported, snapshot refunds kept, counter still reset', () => {
  const p = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 9 }), run(17, 23, 14));
  assert.deepEqual(p.crossCheck, { expected: 21, actual: 9, ok: false });
  assert.deepEqual(p.reconstructed, []);
  assert.equal(p.snapshotPoints, 420);
  assert.equal(p.unexplained.length, 1);
  assert.match(p.unexplained[0].why, /racesSinceTransfer is 9, the snapshots imply 21: earlier races not reconstructed/);
  assert.ok(p.gap.every((g) => g.why === 'reconstruction refused (see UNEXPLAINED)'));
  assert.deepEqual(p.counter, { before: 9, after: 1 });
  const missing = plan(team({ scoredRaces: scoredThrough(23) }), run(17, 23, 14));
  assert.match(missing.unexplained[0].why, /racesSinceTransfer is missing/);
  const s = R.summarize([{ teamId: 'a', plan: p }, { teamId: 'b', plan: plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 21 }), run(17, 23, 14)) }]);
  assert.deepEqual([s.crossChecked, s.crossCheckPassed], [2, 1]);
});

test('reconstruction refunds only races run on or after 2026-06-13; earlier ones are GAP but still count as steps', () => {
  // counter 16 at R17 → r − 1 before round r: penalised from R7 (31 May, before the cap) and R8 (14 June)
  const p = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 23 }), run(17, 23, 16));
  assert.deepEqual(p.reconstructed.map((r) => [r.round, r.counter, r.points]), [[8, 7, 10], [9, 8, 15], [10, 9, 20], [11, 10, 25], [12, 11, 30], [13, 12, 35], [14, 13, 40], [15, 14, 45], [16, 15, 50]]);
  assert.deepEqual(p.gap.map((g) => [g.round, g.why]), [[7, 'before 2026-06-13: counter and scoredRaces were not server-only, repair paths rewrote scoredRaces']]);
  assert.ok(!p.reconstructed.some((r) => r.round < 8));
  // a race with no date is not refunded either
  const undated = new Map(RACES); undated.set(RID(12), { ...RACES.get(RID(12)), raceMs: null });
  const q = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 23 }), run(17, 23, 16), undated);
  assert.ok(!q.reconstructed.some((r) => r.round === 12));
  assert.match(q.gap.find((g) => g.round === 12).why, /no race date/);
});

test('repair-added scoredRaces entries: flagged between snapshots, refused in the window', () => {
  // R19 in scoredRaces with no snapshot and no counter step: 15 at R18 cannot become 16 at R20 two races on
  const snaps = [...run(17, 18, 14), ...run(20, 23, 16)];
  const p = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 20 }), snaps);
  assert.equal(p.unexplained.length, 1);
  assert.match(p.unexplained[0].why, /do not fit the counter rule/);
  assert.equal(p.gap.find((g) => g.round === 19).why, 'scored with no snapshot');
  // a 2026 race id no race doc places: the walk cannot be trusted
  const ghost = plan(team({ scoredRaces: scoredThrough(23, ['ghost_gp_2026']), racesSinceTransfer: 21 }), run(17, 23, 14));
  assert.deepEqual(ghost.reconstructed, []);
  assert.match(ghost.unexplained[0].why, /ghost_gp_2026, which no race doc places/);
  assert.equal(ghost.snapshotPoints, 420, 'snapshot refunds kept');
  // a race in the window that never completed
  const cancelled = new Map(RACES); cancelled.set(RID(12), { ...RACES.get(RID(12)), status: 'cancelled' });
  const c = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 21 }), run(17, 23, 14), cancelled);
  assert.deepEqual(c.reconstructed, []);
  assert.match(c.unexplained[0].why, /britain_2026, which is not a completed race/);
  // quali_/sprint_ keys are not race scorings and never count
  assert.equal(plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 21 }), run(17, 23, 14)).reconPoints, 180);
});

test('the earliest snapshot that disagrees with the next is flagged and anchors nothing (the round-16/17 check)', () => {
  // round 17 says counter 9, round 18 says 12: they cannot both be right
  const p = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 18 }), [snap(17, -20), ...run(18, 23, 12)]);
  assert.deepEqual(p.unexplained.map((u) => [u.round, u.adjustment]), [[17, -20]]);
  assert.match(p.unexplained[0].why, /counter 9 at .* and 12 at .* do not fit/);
  assert.deepEqual(p.snapshotRefunds.map((r) => r.round), [18, 19, 20, 21, 22, 23]);
  assert.deepEqual(p.reconstructed, [], 'no reconstruction from a flagged anchor');
  assert.equal(p.gap.length, 16, 'rounds 1–16 are the gap');
  // a later pair that disagrees flags only its earlier snapshot
  const mid = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 19 }), [...run(17, 19, 12), snap(20, -10), ...run(21, 23, 16)]);
  assert.deepEqual(mid.unexplained.map((u) => u.round), [20], 'the outlier, not its neighbours');
  assert.equal(mid.reconstructed.length, 6, 'anchored on round 17 still');
  // an outlier at the end: the latest snapshot is flagged
  const last = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 19 }), [...run(17, 22, 12), snap(23, -10)]);
  assert.deepEqual(last.unexplained.map((u) => u.round), [23]);
});

test('no reconstruction when the first snapshot shows no penalty, or the counter is longer than the scored races', () => {
  const quiet = plan(team({ scoredRaces: scoredThrough(23) }), run(17, 23, 3)); // 3 at 17 → 9 at 23
  assert.deepEqual(quiet.reconstructed, []);
  assert.deepEqual(quiet.snapshotRefunds.map((r) => [r.round, r.points]), [[20, 5], [21, 10], [22, 15], [23, 20]]);
  assert.equal(quiet.gap.length, 16);
  // counter 20 at round 17 but only 10 scored races before it
  const short = plan(team({ scoredRaces: IDS.slice(6, 23), racesSinceTransfer: 27 }), run(17, 23, 20));
  assert.deepEqual(short.reconstructed, []);
  assert.match(short.unexplained[0].why, /only 10 scored race\(s\) before it/);
});

// ── idempotence ────────────────────────────────────────────────────────────────────────────────
test('idempotent: stamped snapshots and races in staleRefund.races are never refunded again', () => {
  const t = team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 21 });
  const first = plan(t, run(17, 23, 14));
  const stamped = run(17, 23, 14).map((s) => ({ ...s, data: { ...s.data, staleRefund: { at: 'T', points: -s.data.phases.race.adjustment } } }));
  // after the first run the counter is 1: the cross-check reads the value recorded before the reset
  const again = plan({ ...t, racesSinceTransfer: 1, staleRefund: { at: 'T', ...first.staleRefund } }, stamped);
  assert.equal(again.crossCheck.ok, true);
  assert.equal(again.counter, null, 'already 1');
  assert.equal(R.needsWrite(again), false, 'nothing to write');
  assert.equal(again.points, 0);
  assert.deepEqual(again.snapshotRefunds, []);
  assert.deepEqual(again.reconstructed, []);
  assert.equal(again.already.length, 15);
  assert.equal(again.staleRefund, null, 'nothing new: the team record is not rewritten');
  // half done: snapshots stamped, team record missing → only the reconstruction is left
  const half = plan(t, stamped);
  assert.deepEqual([half.snapshotPoints, half.reconPoints], [0, 180]);
});

test('a Vegas-filled team with no penalties gets nothing; a team not filled there is untouched', () => {
  const none = plan(team({ scoredRaces: scoredThrough(23) }), [17, 18, 19, 20, 21, 22, 23].map((r) => snap(r)));
  assert.equal(none.points, 0);
  assert.deepEqual(none.reconstructed, []);
  assert.equal(plan({ totalPoints: 100, racesSinceTransfer: 20, scoredRaces: scoredThrough(23) }, run(17, 23, 14).map(notFilled)), null);
});

test('the counter: every eligible team goes to min(current, 1), whatever its refund', () => {
  assert.deepEqual(plan(team({ racesSinceTransfer: 21, scoredRaces: scoredThrough(23) }), run(17, 23, 14)).counter, { before: 21, after: 1 });
  const zeroRefund = plan(team({ racesSinceTransfer: 7, scoredRaces: scoredThrough(23) }), [17, 18, 19, 20, 21, 22, 23].map((r) => snap(r)));
  assert.equal(zeroRefund.points, 0);
  assert.deepEqual(zeroRefund.counter, { before: 7, after: 1 });
  assert.equal(R.needsWrite(zeroRefund), true, 'a team with nothing to refund still gets the reset');
  assert.equal(plan(team({ racesSinceTransfer: 0 }), [snap(23, -10)]).counter, null, 'transferred since Vegas: stays 0');
  assert.equal(plan(team({ racesSinceTransfer: 1 }), [snap(23, -10)]).counter, null);
  const refused = plan(team({ racesSinceTransfer: 9, scoredRaces: scoredThrough(23) }), run(17, 23, 14));
  assert.deepEqual(refused.counter, { before: 9, after: 1 }, 'reconstruction refused (UNEXPLAINED): still reset');
  const forged = plan(team({ racesSinceTransfer: 21 }), [snap(23, -10)].map(notFilled));
  assert.equal(forged.eligible, false);
  assert.equal(forged.counter, null, 'an ineligible team is not touched');
  assert.equal(R.needsWrite(forged), false);
});

test('writeRefund: set + mergeFields naming only what changes (never update on the team), and the snapshot stamps', () => {
  const calls = [];
  const teamRef = { path: 'fantasyTeams/t1', collection: (c) => { assert.equal(c, 'raceSnapshots'); return { doc: (id) => ({ path: `fantasyTeams/t1/raceSnapshots/${id}` }) }; } };
  const tx = { set: (ref, data, opts) => calls.push(['set', ref.path, data, opts]), update: (ref, data) => calls.push(['update', ref.path, data]) };
  const p = plan(team({ scoredRaces: scoredThrough(23), racesSinceTransfer: 21 }), run(22, 23, 19)); // 19 at 22 → reconstructs 9..21
  R.writeRefund(tx, teamRef, { totalPoints: 500, constructor: { constructorId: 'mclaren' } }, p, 'AT');
  assert.equal(calls[0][0], 'set');
  assert.deepEqual(calls[0][3], { mergeFields: ['totalPoints', 'racesSinceTransfer', 'staleRefund'] });
  assert.equal(calls[0][2].totalPoints, 500 + p.points);
  assert.equal(calls[0][2].racesSinceTransfer, 1);
  assert.equal(calls[0][2].staleRefund.counterBefore, 21);
  assert.equal(calls[0][2].staleRefund.at, 'AT');
  assert.equal(calls[0][2].staleRefund.total, p.reconPoints);
  assert.deepEqual(calls.slice(1), [
    ['update', `fantasyTeams/t1/raceSnapshots/${RID(22)}`, { staleRefund: { at: 'AT', points: 70 } }],
    ['update', `fantasyTeams/t1/raceSnapshots/${VEGAS}`, { staleRefund: { at: 'AT', points: 75 } }],
  ]);
  // a counter of 0 and one snapshot refund: no racesSinceTransfer named
  calls.length = 0;
  const small = plan(team({ racesSinceTransfer: 0 }), [snap(23, -10)]);
  R.writeRefund(tx, teamRef, { totalPoints: 10 }, small, 'AT');
  assert.deepEqual(calls[0], ['set', 'fantasyTeams/t1', { totalPoints: 20, staleRefund: { at: 'AT', races: {}, total: 0, counterBefore: 0 } }, { mergeFields: ['totalPoints', 'staleRefund'] }]);
  // only the counter: only racesSinceTransfer and the record
  calls.length = 0;
  R.writeRefund(tx, teamRef, { totalPoints: 10 }, plan(team({ racesSinceTransfer: 4 }), [snap(23)]), 'AT');
  assert.deepEqual(calls, [['set', 'fantasyTeams/t1', { racesSinceTransfer: 1, staleRefund: { at: 'AT', races: {}, total: 0, counterBefore: 4 } }, { mergeFields: ['racesSinceTransfer', 'staleRefund'] }]]);
  // nothing to do: no write at all
  calls.length = 0;
  R.writeRefund(tx, teamRef, { totalPoints: 10 }, plan(team({ racesSinceTransfer: 1 }), [snap(23)]), 'AT');
  assert.deepEqual(calls, []);
});
