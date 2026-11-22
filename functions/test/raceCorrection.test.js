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
