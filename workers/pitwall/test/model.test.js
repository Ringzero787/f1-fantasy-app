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
  for (const p of p1) { assert.ok(p.floor <= p.median && p.median <= p.ceiling); assert.ok(p.pRise + p.pFall <= 1.0000001); assert.ok(p.pDnf >= 0 && p.pDnf <= 1); }
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

const { buildPayload, shortTeamName } = require(D + 'payload.js');
test('payload builder writes the portal shape, a free look with only top-10 medians, and short team names', () => {
  const proj = [
    { entityId: 'a1', entityType: 'driver', floor: 20, median: 40.4, ceiling: 55, mean: 41, pWin: 0.3, pPodium: 0.6, pTop10: 0.95, pDnf: 0.08, aceMedian: 80.8, pRise: 0.6, pFall: 0.2, expectedPriceChange: 4.2 },
    { entityId: 'b1', entityType: 'driver', floor: 5, median: 12, ceiling: 20, mean: 12, pWin: 0, pPodium: 0.02, pTop10: 0.5, pDnf: 0.2, aceMedian: 24, pRise: 0.1, pFall: 0.6, expectedPriceChange: -6 },
    { entityId: 'car_a', entityType: 'constructor', floor: 30, median: 60, ceiling: 80, mean: 60, pWin: 0, pPodium: 0, pTop10: 0, pDnf: 0, aceMedian: 120, pRise: 0.5, pFall: 0.3, expectedPriceChange: 1 },
  ];
  const { full, free } = buildPayload({
    round: { season: '2026', round: 17, raceId: 'r17', name: 'Harbour Street Race', city: 'Harbour', circuit: 'Harbour Street', firstSession: new Date('2026-09-25T09:00:00Z'), lockAt: new Date('2026-09-26T08:30:00Z'), hasSprint: false },
    nextRounds: [{ round: 17, label: 'HAR', hasSprint: false }, { round: 18, label: 'ISL', hasSprint: true }],
    drivers: [{ id: 'a1', number: 7, name: 'Avery Stone', constructorId: 'car_a', price: 300, isActive: true }, { id: 'b1', number: 8, name: 'Blake Reed', constructorId: 'car_a', price: 90, isActive: true }, { id: 'gone', number: 9, name: 'Gone Away', constructorId: 'car_a', price: 50, isActive: false }],
    constructors: [{ id: 'car_a', name: 'Oracle Car A Racing', price: 500, colors: { primary: '#123456' } }],
    projections: proj, form: new Map([['a1', [20, 50, 41]]]), ownership: new Map([['a1', 62.4]]), priceImplied: (price) => price / 10, asOf: new Date('2026-09-24T06:00:00Z'), budget: 1000,
  });
  assert.equal(full.example, false);
  assert.deepEqual(full.rounds, ['HAR', 'ISL']);
  assert.equal(full.drivers.length, 2); // inactive driver dropped
  const a = full.drivers[0];
  assert.deepEqual([a.id, a.name, a.med, a.floor, a.ceil, a.dnf, a.own, a.pm, a.cons, a.dprice, a.win, a.val], ['a1', 'Stone', 40, 20, 55, 8, 62, 10, 67, 4, 30, 13.3]);
  assert.equal(full.teams.car_a.name, 'Car A');
  assert.equal(full.teams.car_a.color, '#123456');
  assert.equal(full.round.locksIn, '2026-09-26T08:30:00.000Z');
  assert.equal(free.drivers[0].floor, 0);
  assert.equal(free.drivers[0].med, 40);
  // every projection is free, including the ones outside the top ten: a reader has to be able to
  // total their own lineup, whoever is in it
  assert.ok(free.drivers.every((d, i) => d.med === full.drivers[i].med));
  assert.ok(free.constructors.every((c, i) => c.med === full.constructors[i].med));
  assert.equal(free.drivers[0].form.length, 0);
  // the whole grid stays listed so a free user can still see and edit a lineup; only the
  // projections are withheld past the top ten
  assert.equal(free.drivers.length, full.drivers.length);
  assert.equal(free.constructors.length, full.constructors.length);
  assert.equal(free.drivers[0].id, 'a1');
  assert.equal(free.drivers[0].price, 300);
  assert.equal(shortTeamName('Mercedes-AMG Petronas F1 Team'), 'Mercedes');
  // the id wins where we know it: the fallback alone turns "Racing Bulls" into "Bulls"
  assert.equal(shortTeamName('Racing Bulls', 'racing_bulls'), 'RB');
  assert.equal(shortTeamName('Visa Cash App Racing Bulls', 'racing_bulls'), 'RB');
  assert.equal(shortTeamName('Aston Martin Aramco F1 Team', 'aston_martin'), 'Aston Martin');
  assert.equal(shortTeamName('Scuderia Ferrari'), 'Ferrari');
  assert.equal(shortTeamName('Williams Racing'), 'Williams');
});

test('a constructor gets its cars\' chances, not zero, and it only retires when both cars do', () => {
  const form = estimateForm(season(9), entrants);
  const p = simulate(form, { totalLaps: 50, round: 20, hasSprint: false, prices: new Map() }, { runs: 1500, seed: 11, carSd: 1.5, qualiSd: 2.2, chaosRate: 0.3, chaosFactor: 1.25, gridWeight: 0.25 });
  const by = Object.fromEntries(p.map((x) => [x.entityId, x]));
  // car_a runs a1 (always first) and a2, so it wins nearly every race; car_b never does
  assert.ok(by.car_a.pWin > 0.5, `car_a win ${by.car_a.pWin}`);
  assert.ok(by.car_a.pPodium >= by.car_a.pWin);
  assert.ok(by.car_b.pWin < by.car_a.pWin);
  // "at least one car" is never less likely than either car alone
  assert.ok(by.car_a.pPodium >= by.a1.pPodium - 1e-9);
  // both cars must retire for the constructor to, so its risk is below each driver's
  assert.ok(by.car_b.pDnf <= by.b2.pDnf + 1e-9);
});

test('the price direction the payload shows is the blended one the backtest measures', () => {
  const { blendPriceChange, appliedPriceChange } = require(D + 'priceRules.js');
  // with no history the simulation's own expectation stands
  assert.equal(blendPriceChange(8, [], 300), 8);
  // with history it is half the simulation and half what the last three races' pricing points would do
  const hist = [40, 44, 48];
  const last3 = appliedPriceChange((40 + 44 + 48) / 3, 0, 300);
  assert.equal(blendPriceChange(8, hist, 300), 0.5 * 8 + 0.5 * last3);
  // and the payload carries that number, not the raw expectation
  const { buildPayload } = require(D + 'payload.js');
  const proj = [{ entityId: 'a1', entityType: 'driver', floor: 1, median: 10, ceiling: 20, mean: 10, pWin: 0, pPodium: 0, pTop10: 0, pDnf: 0, aceMedian: 20, pRise: 0, pFall: 0, expectedPriceChange: 8 }];
  const { full } = buildPayload({
    round: { season: '2026', round: 1, raceId: 'r', name: 'Harbour Street Race', city: 'Harbour', circuit: 'C', firstSession: null, lockAt: null, hasSprint: false },
    nextRounds: [{ round: 1, label: 'HAR', hasSprint: false }],
    drivers: [{ id: 'a1', number: 1, name: 'Avery Stone', constructorId: 'car_a', price: 300, isActive: true }],
    constructors: [{ id: 'car_a', name: 'Car A', price: 400 }], projections: proj, form: new Map(), ownership: new Map(),
    pricingHistory: new Map([['a1', hist]]), priceImplied: (x) => x / 11, asOf: new Date(0), budget: 1000,
  });
  assert.equal(full.drivers[0].dprice, Math.round(0.5 * 8 + 0.5 * last3));
});

test('what a pick must score comes from the real pricing rule, and there is no neutral band', () => {
  const { pointsToRise, pointsToSoftFall, performancePriceChange } = require(D + 'priceRules.js');
  for (const price of [90, 120, 240, 300, 500]) {
    // at or above the rise line the price goes up; one point below it always falls
    assert.ok(performancePriceChange(pointsToRise(price), price) > 0, `rise ${price}`);
    assert.ok(performancePriceChange(pointsToRise(price) - 1, price) < 0, `below rise ${price}`);
    // the soft-fall line only separates a small fall from a large one: it is still a fall
    assert.ok(performancePriceChange(pointsToSoftFall(price), price) < 0, `soft ${price}`);
    assert.ok(performancePriceChange(pointsToSoftFall(price), price) > performancePriceChange(pointsToSoftFall(price) - 1, price), `softer than terrible ${price}`);
    assert.ok(pointsToRise(price) > pointsToSoftFall(price));
  }
});

test('the free look carries nothing the pass sells, even as the full payload grows', () => {
  const proj = [{ entityId: 'a1', entityType: 'driver', floor: 20, median: 40, ceiling: 55, mean: 41, pWin: 0.3, pPodium: 0.6, pTop10: 0.95, pDnf: 0.08, aceMedian: 80, pRise: 0.6, pFall: 0.2, expectedPriceChange: 4 }];
  const { full, free } = buildPayload({
    round: { season: '2026', round: 17, raceId: 'r17', name: 'Harbour', city: 'Harbour', circuit: 'Harbour Street', firstSession: null, lockAt: null, hasSprint: false },
    nextRounds: [{ round: 17, label: 'HAR', hasSprint: false }],
    drivers: [{ id: 'a1', number: 7, name: 'Avery Stone', constructorId: 'car_a', price: 300, isActive: true }],
    constructors: [{ id: 'car_a', name: 'Car A', price: 500 }],
    projections: proj, form: new Map([['a1', [20, 50]]]), ownership: new Map([['a1', 62]]),
    priceImplied: (price) => price / 10, asOf: new Date('2026-09-24T06:00:00Z'), budget: 1000,
  });
  // the free document is built field by field, so a field added to `full` is not inherited
  full.rivals = [{ name: 'Rival', rank: 2, gap: 4, lineup: ['a1'], bank: 50, activity: 0.5 }];
  full.news = [{ kind: 'PENALTY', entity: 'a1', tone: '-', text: 'secret', sources: '2', detail: 'x' }];
  assert.deepEqual(free.rivals, []);
  assert.deepEqual(free.news, []);
  assert.equal(free.league.name, '');
  // and nothing the pass sells survives on a driver
  const d = free.drivers[0];
  assert.deepEqual([d.floor, d.ceil, d.dnf, d.own, d.pm, d.cons, d.dprice, d.win, d.pod, d.t10, d.val, d.ptsRise, d.pRise, d.form.length], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

const { readForecast, sessionWeather, skyPhrase, pointFor } = require(D + 'weather.js');
test('session weather reports what the forecast measures and nothing else', () => {
  const body = { properties: { timeseries: [
    { time: '2026-09-26T10:00:00Z', data: { instant: { details: { air_temperature: 24.4, wind_speed: 5 } }, next_1_hours: { summary: { symbol_code: 'clearsky_day' }, details: { precipitation_amount: 0 } } } },
    { time: '2026-09-26T11:00:00Z', data: { instant: { details: { air_temperature: 25.3, wind_speed: 4.7 } }, next_1_hours: { summary: { symbol_code: 'lightrain' }, details: { precipitation_amount: 0.42 } } } },
    { time: '2026-10-04T07:00:00Z', data: { instant: { details: { air_temperature: 30 } }, next_6_hours: { summary: { symbol_code: 'rain' }, details: { precipitation_amount: 3 } } } },
  ] } };
  const points = readForecast(body);
  assert.equal(points.length, 3);
  assert.equal(points[1].precipitationMm, 0.42);

  const now = new Date('2026-09-25T14:00:00Z');
  const out = sessionWeather([
    { key: 'race', label: 'Race', at: new Date('2026-09-26T11:00:00Z') },
    { key: 'next', label: 'Next round', at: new Date('2026-10-04T07:00:00Z') },
    // beyond the horizon, so it is left out rather than guessed
    { key: 'far', label: 'Far', at: new Date('2026-11-01T12:00:00Z') },
  ], points, now);
  assert.deepEqual(out.map((w) => w.key), ['race', 'next']);
  assert.deepEqual([out[0].tempC, out[0].rainMm, out[0].sky, out[0].windKph], [25, 0.4, 'light rain', 17]);
});

test('a session with no forecast within the hour gets none, and a bad body yields nothing', () => {
  const points = readForecast({ properties: { timeseries: [
    { time: '2026-09-26T00:00:00Z', data: { instant: { details: { air_temperature: 20 } } } },
  ] } });
  assert.equal(pointFor(points, new Date('2026-09-26T11:00:00Z')), null);
  assert.deepEqual(sessionWeather([{ key: 'race', label: 'Race', at: new Date('2026-09-26T11:00:00Z') }], points, new Date('2026-09-25T14:00:00Z')), []);
  assert.deepEqual(readForecast(null), []);
  assert.deepEqual(readForecast({ properties: {} }), []);
});

test('the forecast symbol becomes a phrase a reader can use', () => {
  assert.equal(skyPhrase('clearsky_day'), 'clear');
  assert.equal(skyPhrase('partlycloudy_night'), 'part cloud');
  assert.equal(skyPhrase('heavyrainshowers_day'), 'heavy showers');
  assert.equal(skyPhrase(null), null);
});

const { buildWire, tagEntity, kindOf, toneOf, headlineOnly, teamVariants } = require(D + 'wire.js');
test('the wire tags headlines to whoever they name, ranks the useful ones first, and drops fluff', () => {
  const names = { drivers: { russell: 'Russell', antonelli: 'Antonelli', gasly: 'Gasly' }, constructors: { mclaren: ['McLaren'], aston_martin: ['Aston Martin Aramco F1 Team', 'Aston', 'Martin', 'Aramco'] } };
  const now = new Date('2026-09-25T15:00:00Z');
  const at = (h) => new Date(now.getTime() - h * 3600000);
  const items = buildWire([
    { title: 'Russell charges to Baku pole as Antonelli exits Qualifying early', summary: 'body', url: 'https://x/1', source: 'F1', category: 'qualifying', publishedAt: at(1) },
    { title: 'How 46 fashion designers reimagined McLaren’s F1 history', summary: 'body', url: 'https://x/2', source: 'F1', category: 'general', publishedAt: at(2) },
    { title: 'Five things to watch this weekend', summary: 'body', url: 'https://x/3', source: 'F1', category: 'general', publishedAt: at(3) },
    { title: 'Stewards hand Gasly a three-place grid drop', summary: 'body', url: 'https://x/4', source: 'FIA', category: 'regulation', publishedAt: at(5) },
    { title: 'Russell charges to Baku pole as Antonelli exits Qualifying early', summary: 'dup', url: 'https://x/5', source: 'F1', category: 'qualifying', publishedAt: at(1) },
    { title: 'Old news', summary: '', url: 'https://x/6', source: 'F1', category: 'race', publishedAt: at(24 * 9) },
  ], names, now);
  // a penalty outranks a pole headline even when the pole is fresher: it changes the grid
  assert.deepEqual(items.map((i) => i.url), ['https://x/4', 'https://x/1', 'https://x/2']);
  assert.equal(items[0].kind, 'PENALTY');
  assert.equal(items[0].tone, '-');
  assert.equal(items[0].entity, 'gasly');
  assert.equal(items[1].entity, 'russell');          // a driver beats a team, first match wins
  assert.equal(items[1].kind, 'QUALIFYING');
  assert.equal(items[1].tone, '+');                  // "charges to ... pole"
  assert.equal(headlineOnly(items[1]).detail, '');
  assert.equal(headlineOnly(items[1]).url, 'https://x/1');
  assert.equal(items[2].entity, 'mclaren');          // general survives only because it names someone
});

test('a headline with nobody on the grid in it is still typed and toned', () => {
  const a = { title: 'FIA issues technical directive on floor flexing', summary: '', url: 'https://x', source: 'FIA', category: 'regulation', publishedAt: new Date() };
  assert.equal(kindOf(a), 'REGULATION');
  assert.equal(toneOf(a), '•');
  assert.equal(tagEntity(a.title, { drivers: {}, constructors: {} }), null);
});

const { gridOffsets, offsetPlace, sessionFrames, buildWeatherMap } = require(D + 'weatherMap.js');
test('the weather map is a 5x5 grid, row-major from the north-west, with frames around each session', () => {
  const offs = gridOffsets(2);
  assert.equal(offs.length, 25);
  assert.deepEqual(offs[0], { dx: -2, dy: 2 });   // north-west: dy is north-positive, so the top row is +2
  assert.deepEqual(offs[12], { dx: 0, dy: 0 });
  const north = offsetPlace({ lat: 40.37, lon: 49.85 }, 0, 1, 40);
  assert.ok(north.lat > 40.7 && north.lat < 40.75);
  assert.equal(north.lon, 49.85);

  const race = new Date('2026-09-26T11:00:00Z');
  const point = (t, mm, wind) => ({ time: t.toISOString(), airTemperature: 20, precipitationMm: mm, symbol: null, windMs: wind, windFromDeg: 315 });
  const cells = offs.map(({ dx, dy }) => ({ dx, dy, points: [-3, 0, 3].map((h) => point(new Date(race.getTime() + h * 3600000), dx === -2 && dy === 2 ? 2.5 : 0, 5)) }));
  const frames = sessionFrames(race, cells, 2);
  assert.equal(frames.length, 3);
  assert.deepEqual(frames.map((f) => f.offsetH), [-3, 0, 3]);
  assert.equal(frames[1].rainMm[0], 2.5);           // index 0 is the north-west corner, which the fixture made wet
  assert.equal(frames[1].rainMm[12], 0);            // the circuit is dry
  assert.equal(frames[1].windFromDeg, 315);
  assert.equal(frames[1].windKph, 18);

  const map = buildWeatherMap({ lat: 40.37, lon: 49.85 }, [
    { key: 'race', label: 'Race', at: race },
    { key: 'far', label: 'Far', at: new Date('2026-11-01T12:00:00Z') },
  ], cells, new Date('2026-09-25T15:00:00Z'));
  assert.deepEqual(map.sessions.map((s) => s.key), ['race']);
  assert.equal(buildWeatherMap({ lat: 0, lon: 0 }, [{ key: 'race', label: 'Race', at: race }], offs.map(({ dx, dy }) => ({ dx, dy, points: [] })), new Date()), null);
});

test('a team is recognised by its names, never by a sponsor or a generic word alone', () => {
  const v = teamVariants('Aston Martin Aramco F1 Team', 'Aston Martin');
  assert.ok(v.includes('Aston Martin'));
  assert.ok(!v.includes('Team') && !v.includes('Aramco'));
  const names = { drivers: {}, constructors: { aston_martin: v, red_bull: teamVariants('Oracle Red Bull Racing', 'Red Bull') } };
  assert.equal(tagEntity('Team principal meeting called for Friday', names), null);
  assert.equal(tagEntity('Racing resumes after the red flag', names), null);
  assert.equal(tagEntity('Aston Martin bring a new floor', names), 'aston_martin');
  // a feed item with a link that is not https is not published at all
  const out = buildWire([{ title: 'Aston Martin bring a new floor', summary: '', url: 'http://x/1', source: 'F1', category: 'practice', publishedAt: new Date() }], names, new Date());
  assert.equal(out.length, 0);
});
