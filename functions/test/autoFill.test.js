// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectValueFill, planAutoFill, isIncomplete, hasEverFielded, TEAM_SIZE } = require('../lib/teams/autoFill.js');

const D = (id, price, form, constructorId = 'x') => ({ id, name: id, shortName: id.slice(0, 3).toUpperCase(), constructorId, price, form });

// A slice of the real R16 market: stars, the value band, and the $5 tail the
// old cheapest-first fill used to buy.
const MARKET = [
  D('antonelli', 583, 60), D('norris', 591, 44), D('hamilton', 527, 51),
  D('lawson', 202, 33), D('gasly', 178, 30), D('lindblad', 197, 28), D('hadjar', 89, 35),
  D('hulkenberg', 65, 17), D('alonso', 86, 9), D('bottas', 29, 4), D('perez', 17, 10), D('stroll', 5, 2),
];
const CTORS = [D('mercedes', 657, 109), D('racing_bulls', 201, 56), D('audi', 156, 41), D('aston_martin', 9, 13)];

test('fills five seats with the best-form combination the bank affords, not the cheapest', () => {
  const r = selectValueFill({ budget: 740, driverSlots: 5, needConstructor: false, drivers: MARKET, constructors: [] });
  assert.equal(r.drivers.length, 5);
  assert.ok(r.cost <= 740);
  const ids = r.drivers.map((d) => d.id).sort();
  // Hadjar/Lawson/Gasly/Lindblad/Hulkenberg = $731 for 143 pts/race; the old
  // fill would have bought stroll/perez/bottas/hulkenberg/alonso for ~42.
  assert.deepEqual(ids, ['gasly', 'hadjar', 'hulkenberg', 'lawson', 'lindblad']);
  assert.equal(r.form, 143);
  assert.ok(!ids.includes('stroll'));
});

test('a star is bought only when the leftover still fills every seat well', () => {
  const r = selectValueFill({ budget: 1000, driverSlots: 5, needConstructor: false, drivers: MARKET, constructors: [] });
  assert.equal(r.drivers.length, 5);
  assert.ok(r.cost <= 1000);
  // Exhaustive check that nothing affordable beats it.
  let best = -1;
  const n = MARKET.length;
  for (let m = 0; m < 1 << n; m++) {
    const pick = MARKET.filter((_, i) => m & (1 << i));
    if (pick.length !== 5) continue;
    const cost = pick.reduce((a, d) => a + d.price, 0);
    if (cost > 1000) continue;
    best = Math.max(best, pick.reduce((a, d) => a + d.form, 0));
  }
  assert.equal(r.form, best);
});

test('seat count beats form: a tiny bank still fills as many seats as it can', () => {
  const r = selectValueFill({ budget: 60, driverSlots: 3, needConstructor: false, drivers: MARKET, constructors: [] });
  assert.equal(r.drivers.length, 3); // stroll + perez + bottas = $51
  assert.deepEqual(r.drivers.map((d) => d.id).sort(), ['bottas', 'perez', 'stroll']);
});

test('constructor is chosen jointly with the drivers and counts as a seat', () => {
  const r = selectValueFill({ budget: 900, driverSlots: 2, needConstructor: true, drivers: MARKET, constructors: CTORS });
  assert.ok(r.constructor, 'constructor filled');
  assert.equal(r.drivers.length, 2);
  assert.ok(r.cost <= 900);
  // Exhaustive: every affordable (constructor, 2 drivers) combo.
  let best = -1;
  for (const c of CTORS) {
    for (let i = 0; i < MARKET.length; i++) {
      for (let j = i + 1; j < MARKET.length; j++) {
        if (c.price + MARKET[i].price + MARKET[j].price > 900) continue;
        best = Math.max(best, c.form + MARKET[i].form + MARKET[j].form);
      }
    }
  }
  // mercedes ($657, 109) + hadjar + hulkenberg ($154, 52) = 161.
  assert.equal(r.constructor.id, 'mercedes');
  assert.equal(r.form, best);
  assert.equal(r.form, 161);
});

test('no affordable constructor falls back to drivers only', () => {
  const r = selectValueFill({ budget: 8, driverSlots: 1, needConstructor: true, drivers: MARKET, constructors: CTORS });
  assert.equal(r.constructor, null);
  assert.deepEqual(r.drivers.map((d) => d.id), ['stroll']);
});

test('nothing affordable at all returns an empty fill', () => {
  const r = selectValueFill({ budget: 3, driverSlots: 5, needConstructor: true, drivers: MARKET, constructors: CTORS });
  assert.deepEqual(r, { drivers: [], constructor: null, cost: 0, form: 0 });
});

const CTX = { drivers: MARKET, constructors: CTORS, completedRaceCount: 14, formRaceIds: ['a', 'b', 'c', 'd', 'e'] };
const held = (id, extra = {}) => ({ driverId: id, name: id, purchasePrice: 100, currentPrice: 100, pointsScored: 40, racesHeld: 1, contractLength: 3, ...extra });

test('planAutoFill: complete team is left alone', () => {
  const team = { drivers: ['a', 'b', 'c', 'd', 'e'].map(held), constructor: { constructorId: 'audi' }, budget: 500 };
  assert.equal(isIncomplete(team), false);
  assert.equal(planAutoFill(team, CTX), null);
});

test('planAutoFill: a shell that never fielded a car is not filled', () => {
  const shell = { drivers: [], constructor: null, budget: 1000, scoredRaces: [] };
  assert.equal(hasEverFielded(shell), false);
  assert.equal(planAutoFill(shell, CTX), null);
});

test('planAutoFill: a hollowed-out team (everything expired) is refilled from its bank', () => {
  const team = { drivers: [], constructor: null, budget: 1200, scoredRaces: ['x'], driverLockouts: { hadjar: 15, gasly: 14 } };
  const plan = planAutoFill(team, CTX);
  assert.ok(plan);
  assert.equal(plan.drivers.length, TEAM_SIZE);
  assert.ok(plan.constructor);
  const ids = plan.drivers.map((d) => d.driverId);
  assert.ok(!ids.includes('hadjar'), 'locked out until round 15 is skipped');
  assert.ok(ids.includes('gasly'), 'lockout that expired at 14 is eligible again');
  assert.equal(plan.budget, 1200 - plan.cost);
  assert.ok(plan.drivers.every((d) => d.isReservePick && d.racesHeld === 0 && d.addedAtRace === 14 && d.contractLength === 3));
  assert.equal(plan.constructor.isReservePick, true);
  assert.deepEqual(plan.filledDriverIds, ids);
});

test('planAutoFill: keeps held drivers, fills only the open seats, never duplicates', () => {
  const team = { drivers: [held('lawson'), held('gasly')], constructor: { constructorId: 'audi', racesHeld: 1 }, budget: 300, scoredRaces: ['x'] };
  const plan = planAutoFill(team, CTX);
  assert.ok(plan);
  assert.equal(plan.drivers.length, 5);
  assert.equal(plan.constructor.constructorId, 'audi');
  assert.equal(plan.filledConstructorId, null);
  const ids = plan.drivers.map((d) => d.driverId);
  assert.equal(new Set(ids).size, 5);
  assert.deepEqual(ids.slice(0, 2), ['lawson', 'gasly']);
  assert.ok(plan.cost <= 300);
});
