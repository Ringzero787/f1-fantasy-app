// Runs with the unit suite: `npm --prefix functions run build && node --test functions/test/*.test.js`.
//
// F-170 repair: the planning half of scripts/refundStalePenalties.js — which teams, which snapshots,
// which adjustments are given back. The writes are proven on the emulator
// (test/emulator/staleRefund.emu.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../scripts/refundStalePenalties.js');

const vegasFilled = (extra = {}) => ({ name: 'Abandoned', totalPoints: 500, lastAutoFill: { raceId: 'las_vegas_2026', driverIds: ['lawson'], constructorId: null, cost: 61 }, ...extra });
const snap = (id, round, adjustment, extra = {}) => ({
  id,
  data: { raceId: id, season: '2026', round, roster: { drivers: [{ driverId: 'norris' }, { driverId: 'hadjar' }], constructor: { constructorId: 'mclaren' } },
    phases: { race: { points: 40 + (adjustment || 0), entities: { norris: 25, hadjar: 15 }, ...(adjustment !== undefined ? { adjustment } : {}) } }, ...extra },
});

test('only teams auto-filled at Las Vegas are in scope', () => {
  const snaps = [snap('las_vegas_2026', 23, -50)];
  assert.equal(R.planTeamRefund({ totalPoints: 9 }, snaps), null, 'never auto-filled');
  assert.equal(R.planTeamRefund(vegasFilled({ lastAutoFill: { raceId: 'qatar_2026' } }), snaps), null, 'filled at another race');
  assert.equal(R.planTeamRefund(vegasFilled({ lastAutoFill: null }), snaps), null);
  assert.equal(R.planTeamRefund(vegasFilled({ lastAutoFill: 'las_vegas_2026' }), snaps), null, 'a malformed stamp is not a fill');
  assert.equal(R.planTeamRefund(vegasFilled(), snaps).points, 50);
});

test('every negative race-phase adjustment of 2026 is refunded; the Vegas share is reported on its own', () => {
  const plan = R.planTeamRefund(vegasFilled(), [
    snap('las_vegas_2026', 23, -50), snap('brazil_2026', 22, -45), snap('mexico_2026', 20, -35), snap('miami_2026', 6),
  ]);
  assert.deepEqual(plan.refunds.map((r) => [r.raceId, r.points]), [['mexico_2026', 35], ['brazil_2026', 45], ['las_vegas_2026', 50]], 'ordered by round');
  assert.equal(plan.points, 130);
  assert.equal(plan.vegasPoints, 50);
  assert.deepEqual(plan.unexplained, []);
});

test('only negative adjustments, and only in the race phase', () => {
  const plan = R.planTeamRefund(vegasFilled(), [
    snap('a_2026', 1, 15), // positive: never a penalty
    snap('b_2026', 2, 0),
    { id: 'c_2026', data: { season: '2026', round: 3, phases: { qualifying: { points: -10, adjustment: -10 }, sprint: { points: 0, adjustment: -5 }, race: { points: 12, entities: { x: 12 } } } } },
    { id: 'd_2026', data: { season: '2026', round: 4, phases: { race: { points: 0, adjustment: Number.NaN } } } }, // coerced non-finite run: nothing was taken
    { id: 'e_2026', data: { season: '2026', round: 5, phases: { race: { points: 0, adjustment: '-30' } } } },
    { id: 'f_2026', data: { season: '2026', round: 6 } }, // no phases at all
    snap('g_2026', 7, -10),
  ]);
  assert.deepEqual(plan.refunds.map((r) => r.raceId), ['g_2026']);
  assert.equal(plan.points, 10);
});

test('a negative adjustment that is not shaped like a stale penalty is reported, not refunded', () => {
  const dup = snap('h_2026', 8, -15);
  dup.data.roster.drivers.push({ driverId: 'norris' });
  const plan = R.planTeamRefund(vegasFilled(), [snap('i_2026', 9, -7), dup, snap('j_2026', 10, -5)]);
  assert.deepEqual(plan.refunds.map((r) => r.raceId), ['j_2026']);
  assert.deepEqual(plan.unexplained.map((u) => [u.raceId, u.adjustment]).sort(), [['h_2026', -15], ['i_2026', -7]]);
  assert.match(plan.unexplained.find((u) => u.raceId === 'h_2026').why, /twice/);
});

test('2026 only: season field first, the race id for snapshots without one', () => {
  const plan = R.planTeamRefund(vegasFilled(), [
    snap('abu_dhabi_2025', 24, -20, { season: '2025' }),
    snap('australia_2027', 1, -20, { season: '2027' }),
    snap('weird_2026', 2, -20, { season: '2025' }), // the field wins over the id
    snap('old_2026', 3, -25, { season: null }), // pre-season-field snapshot: the id decides
    snap('older_2025', 4, -25, { season: undefined }),
    snap('numeric', 5, -30, { season: 2026 }),
    snap('seasonid_only', 6, -40, { season: undefined, seasonId: '2026' }),
  ]);
  assert.deepEqual(plan.refunds.map((r) => r.raceId).sort(), ['numeric', 'old_2026', 'seasonid_only']);
  assert.equal(R.isSeasonSnapshot('x_2026', {}), true);
  assert.equal(R.isSeasonSnapshot('x_2025', {}), false);
});

test('idempotent: a snapshot stamped staleRefund is never refunded again', () => {
  const stamped = snap('brazil_2026', 22, -45, { staleRefund: { at: 'T', points: 45 } });
  const plan = R.planTeamRefund(vegasFilled(), [stamped, snap('las_vegas_2026', 23, -50)]);
  assert.deepEqual(plan.refunds.map((r) => r.raceId), ['las_vegas_2026']);
  assert.deepEqual(plan.already.map((r) => [r.raceId, r.points]), [['brazil_2026', 45]]);
  const all = R.planTeamRefund(vegasFilled(), [stamped, snap('las_vegas_2026', 23, -50, { staleRefund: { at: 'T', points: 50 } })]);
  assert.equal(all.points, 0);
  assert.deepEqual(all.refunds, []);
});

test('a Vegas-filled team with no penalties gets nothing', () => {
  const none = R.planTeamRefund(vegasFilled(), [snap('las_vegas_2026', 23), snap('brazil_2026', 22, 0)]);
  assert.equal(none.points, 0);
  assert.deepEqual(none.refunds, []);
  assert.equal(R.planTeamRefund(vegasFilled(), []).points, 0, 'no snapshots at all');
});

test('a team not filled at Las Vegas is untouched even with penalties', () => {
  const heavy = [snap('las_vegas_2026', 23, -75), snap('brazil_2026', 22, -70)];
  assert.equal(R.planTeamRefund({ totalPoints: 100, racesSinceTransfer: 20 }, heavy), null);
  const plans = [{ teamId: 'active', plan: R.planTeamRefund({ totalPoints: 100 }, heavy) }];
  assert.equal(R.summarize(plans).teams, 0);
});

test('summary: total, per race, the Vegas-only subtotal, team count and worst team', () => {
  const plans = [
    { teamId: 't1', name: 'One', plan: R.planTeamRefund(vegasFilled(), [snap('las_vegas_2026', 23, -50), snap('brazil_2026', 22, -45)]) },
    { teamId: 't2', name: 'Two', plan: R.planTeamRefund(vegasFilled(), [snap('las_vegas_2026', 23, -10)]) },
    { teamId: 't3', name: 'Three', plan: R.planTeamRefund(vegasFilled(), [snap('brazil_2026', 22, -5)]) },
    { teamId: 't4', name: 'Clean', plan: R.planTeamRefund(vegasFilled(), [snap('las_vegas_2026', 23)]) },
    { teamId: 't5', name: 'Active', plan: null },
  ];
  const s = R.summarize(plans);
  assert.equal(s.teams, 3);
  assert.equal(s.total, 110);
  assert.equal(s.vegas, 60);
  assert.equal(s.vegasTeams, 2);
  assert.deepEqual(s.races.map((r) => [r.raceId, r.points, r.teams]), [['brazil_2026', 50, 2], ['las_vegas_2026', 60, 2]]);
  assert.deepEqual(s.worst, { teamId: 't1', name: 'One', points: 95, races: 2 });
});

test('writeRefund names only totalPoints on the team (set + mergeFields, never update) and stamps each snapshot', () => {
  const calls = [];
  const snapRef = (id) => ({ path: `fantasyTeams/t1/raceSnapshots/${id}` });
  const teamRef = { path: 'fantasyTeams/t1', collection: (c) => { assert.equal(c, 'raceSnapshots'); return { doc: snapRef }; } };
  const tx = {
    set: (ref, data, opts) => calls.push(['set', ref.path, data, opts]),
    update: (ref, data) => calls.push(['update', ref.path, data]),
  };
  const plan = R.planTeamRefund(vegasFilled(), [snap('las_vegas_2026', 23, -50), snap('brazil_2026', 22, -45)]);
  R.writeRefund(tx, teamRef, { totalPoints: 500, constructor: { constructorId: 'mclaren' } }, plan, 'AT');
  assert.deepEqual(calls, [
    ['set', 'fantasyTeams/t1', { totalPoints: 595 }, { mergeFields: ['totalPoints'] }],
    ['update', 'fantasyTeams/t1/raceSnapshots/brazil_2026', { staleRefund: { at: 'AT', points: 45 } }],
    ['update', 'fantasyTeams/t1/raceSnapshots/las_vegas_2026', { staleRefund: { at: 'AT', points: 50 } }],
  ]);
  assert.ok(!calls.some(([op, path]) => op === 'update' && path === 'fantasyTeams/t1'), 'never update() on the team doc');
});
