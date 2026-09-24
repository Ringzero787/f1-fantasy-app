const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = '../dist/workers/pitwall/src/model/';
const { ALLOWED_INPUT_COLLECTIONS, assertAllowedInputs } = require(D + 'inputs.js');
const rules = require(D + 'priceRules.js');
const { scoreWeekend } = require(D + 'scoreRace.js');
const { estimateForm } = require(D + 'strength.js');
const { simulate } = require(D + 'simulate.js');
const { backtest } = require(D + 'backtest.js');
const core = require('../dist/functions/src/scoring/scoringCore.js');

test('the model input set is closed: results, prices and our own data only, never timing (ADR-001)', () => {
  assert.deepEqual([...ALLOWED_INPUT_COLLECTIONS], ['races', 'raceScores', 'priceHistory', 'drivers', 'constructors']);
  assert.doesNotThrow(() => assertAllowedInputs(['races', 'raceScores']));
  for (const bad of ['pw_public_timing', 'laps', 'stints', 'pitStops', 'weather', 'race_control', 'articles']) assert.throws(() => assertAllowedInputs([bad]), /not allowed/);
});

test('price rules are identical to the production source they were copied from', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'functions', 'src', 'scoring', 'calculatePoints.ts'), 'utf8');
  const num = (name) => Number(new RegExp(`const ${name} = ([0-9.]+);`).exec(src)[1]);
  for (const k of ['TIER_A_THRESHOLD', 'TIER_B_THRESHOLD', 'PPM_GREAT', 'PPM_GOOD', 'PPM_POOR', 'MIN_PRICE', 'MAX_PRICE', 'DIMINISH_FLOOR', 'DIMINISH_MIN_FACTOR', 'DNF_PRICE_PENALTY_MAX', 'DNF_PRICE_PENALTY_MIN']) assert.equal(rules[k], num(k), k);
  for (const t of ['A_TIER', 'B_TIER', 'C_TIER']) {
    const m = new RegExp(`${t}: \\{ great: (-?\\d+), good: (-?\\d+), poor: (-?\\d+), terrible: (-?\\d+) \\}`).exec(src);
    assert.deepEqual(Object.values(rules.PRICE_CHANGES[t]), m.slice(1, 5).map(Number), t);
  }
  const arr = (name) => JSON.parse(new RegExp(`const ${name} = (\\[[0-9, ]+\\]);`).exec(src)[1]);
  assert.deepEqual(rules.PRICING_RACE_POINTS, arr('PRICING_RACE_POINTS'));
  assert.deepEqual(rules.PRICING_SPRINT_POINTS, arr('PRICING_SPRINT_POINTS'));
  // behaviour: a cheap pick that scores well rises, an expensive one that scores nothing falls, clamped at the floor
  assert.equal(rules.appliedPriceChange(30, 0, 100), 5 * 0 + 12);
  assert.equal(rules.appliedPriceChange(0, 0, 300), -36);
  assert.equal(rules.appliedPriceChange(0, 24, 10), -5);
});

const race = (order, extra = {}) => order.map((id, i) => ({ driverId: id, constructorId: id[0] === 'a' ? 'car_a' : 'car_b', position: i + 1, gridPosition: i + 1, status: 'finished', fastestLap: i === 0, laps: 50, ...(extra[id] || {}) }));

test('the weekend scorer gives exactly what scoringCore gives (projections cannot drift from scoring)', () => {
  const rr = race(['a1', 'b1', 'a2', 'b2'], { b2: { status: 'dnf', laps: 10, position: 0 }, a2: { gridPosition: 1 } });
  const quali = [{ driverId: 'a2', constructorId: 'car_a', position: 1 }, { driverId: 'a1', constructorId: 'car_a', position: 2 }];
  const s = scoreWeekend(rr, quali, [{ driverId: 'a1', position: 1, status: 'finished' }], { totalLaps: 50, round: 20 });
  for (const r of rr) {
    const sprint = r.driverId === 'a1' ? { position: 1, driverId: 'a1', status: 'finished' } : null;
    const q = quali.find((x) => x.driverId === r.driverId);
    const want = core.calculateDriverPoints(r, sprint, 0, false, { totalLaps: 50, round: 20 }) - core.calculateLockBonus(0) + (q ? core.calculateQualifyingPoints(q.position) : 0);
    assert.equal(s.points.get(r.driverId), want, r.driverId);
  }
  // constructor: both cars' race points and position bonus plus qualifying; a retirement adds nothing
  const carA = [1, 3].reduce((t, p) => t + core.RACE_POINTS[p - 1] + core.GRID_SIZE + 1 - p, 0) + core.calculateQualifyingPoints(1) + core.calculateQualifyingPoints(2);
  assert.equal(s.points.get('car_a'), carA);
  assert.ok(s.dnfPricePenalty.get('b2') > 0 && s.dnfPricePenalty.get('car_b') === s.dnfPricePenalty.get('b2'));
});

function season(n) {
  // a1 always wins, b2 is always last and retires every third race
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`, season: '2030', round: i + 1, hasSprint: false, totalLaps: 50,
    raceResults: race(['a1', 'a2', 'b1', 'b2'], i % 3 === 2 ? { b2: { status: 'dnf', laps: 5, position: 0 } } : {}),
    qualifyingResults: ['a1', 'a2', 'b1', 'b2'].map((id, j) => ({ driverId: id, constructorId: id[0] === 'a' ? 'car_a' : 'car_b', position: j + 1 })), sprintResults: [],
  }));
}
const entrants = ['a1', 'a2', 'b1', 'b2'].map((id) => ({ driverId: id, constructorId: id[0] === 'a' ? 'car_a' : 'car_b' }));

test('form follows results, shrinks a newcomer to the car, and the simulation is seeded and ordered sensibly', () => {
  const form = estimateForm(season(9), [...entrants, { driverId: 'a3', constructorId: 'car_a' }]);
  const f = Object.fromEntries(form.drivers.map((d) => [d.driverId, d]));
  assert.ok(f.a1.raceMu < f.a2.raceMu && f.a2.raceMu < f.b1.raceMu);
  assert.ok(f.b2.dnfHazard > f.a1.dnfHazard);
  assert.ok(f.a3.raceMu > f.a1.raceMu && f.a3.raceMu < f.b1.raceMu); // no data: sits at the car's level
  const ctx = { totalLaps: 50, round: 20, hasSprint: false, prices: new Map([['a1', 300], ['b2', 40]]) };
  const p1 = simulate(estimateForm(season(9), entrants), ctx, { runs: 1500, seed: 5, carSd: 1.5, qualiSd: 2.2, chaosRate: 0.3, chaosFactor: 1.5, gridWeight: 0.25 });
  const p2 = simulate(estimateForm(season(9), entrants), ctx, { runs: 1500, seed: 5, carSd: 1.5, qualiSd: 2.2, chaosRate: 0.3, chaosFactor: 1.5, gridWeight: 0.25 });
  assert.deepEqual(p1, p2);
  const by = Object.fromEntries(p1.map((p) => [p.entityId, p]));
  assert.ok(by.a1.median > by.b2.median && by.a1.pWin > by.b2.pWin);
  for (const p of p1) { assert.ok(p.floor <= p.ceiling); assert.ok(p.pRise + p.pFall <= 1.0000001); assert.ok(p.pDnf >= 0 && p.pDnf <= 1); }
  // the band is taken over finishing runs, so a driver who retires often still has a floor above the DNF penalty
  assert.ok(by.b2.floor > -8);
  assert.equal(by.car_a.entityType, 'constructor');
  assert.equal(by.a1.aceMedian, by.a1.median * 2);
});

test('backtest on a perfectly regular season: tiny errors, full scoring parity, and an honest verdict object', () => {
  const races = season(10);
  const scores = [];
  for (const r of races) for (const [id, pts] of scoreWeekend(r.raceResults, r.qualifyingResults, [], { totalLaps: 50, round: r.round }).points) scores.push({ raceId: r.id, round: r.round, entityId: id, entityType: id.startsWith('car') ? 'constructor' : 'driver', totalPoints: pts });
  const rep = backtest({ races, scores, prices: [] }, { sim: { runs: 800 } });
  assert.equal(rep.scoringParity.mismatches, 0);
  assert.equal(rep.testRaces.length, 7);
  assert.ok(rep.all.n === 7 * 6);
  assert.ok(Number.isFinite(rep.improvement.mean) && rep.improvement.lo <= rep.improvement.hi);
  assert.equal(typeof rep.verdict.ships, 'boolean');
  assert.equal(rep.verdict.ships, rep.verdict.beatsBaseline && rep.verdict.bandInTarget && rep.verdict.priceOk);
});
