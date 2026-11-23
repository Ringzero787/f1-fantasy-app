// F-169: contract length is capped by the season's end and by six races in a row with one driver.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  MAX_CONTRACT_LENGTH, MAX_CONSECUTIVE_RACES,
  racesLeftInSeason, priorStreak, allowedContractLength, streaksAfterSale,
} = require('../lib/teams/contractRules.js');
const { planAutoFill } = require('../lib/teams/autoFill.js');

test('the caps are six', () => {
  assert.equal(MAX_CONTRACT_LENGTH, 6);
  assert.equal(MAX_CONSECUTIVE_RACES, 6);
});

test('races left: not completed, not cancelled', () => {
  const races = [{ status: 'completed' }, { status: 'cancelled' }, { status: 'upcoming' }, { status: 'upcoming' }, { status: 'locked' }];
  assert.equal(racesLeftInSeason(races), 3);
  assert.equal(racesLeftInSeason([{ status: 'completed' }]), 0);
});

test('a contract never runs past the season', () => {
  assert.equal(allowedContractLength(6, 1), 1, 'one race left: six becomes one');
  assert.equal(allowedContractLength(3, 2), 2, 'the shipped default (3) with two left');
  assert.equal(allowedContractLength(2, 10), 2, 'shorter than the season: as asked');
  assert.equal(allowedContractLength(10, 20), 6, 'never more than six');
  assert.equal(allowedContractLength(3, 0), 1, 'season over, rollover not yet run: one race');
});

test('six in a row: a re-buy in the same window continues the run', () => {
  assert.equal(allowedContractLength(6, 20, 4), 2, 'held four, re-bought: two more at most');
  assert.equal(allowedContractLength(6, 1, 4), 1, 'and the season still applies');
  assert.equal(allowedContractLength(1, 20, 5), 1);
  assert.equal(allowedContractLength(1, 20, 6), 0, 'a full run: locked out');
  assert.equal(allowedContractLength(3, 20, 7), 0);
});

test('the run only carries within one window', () => {
  const streaks = { verstappen: { held: 4, atRace: 21 } };
  assert.equal(priorStreak(streaks, 'verstappen', 21), 4, 'same window: carries');
  assert.equal(priorStreak(streaks, 'verstappen', 22), 0, 'a race went by without him: the run is broken');
  assert.equal(priorStreak(streaks, 'norris', 21), 0);
  assert.equal(priorStreak(undefined, 'verstappen', 21), 0);
  assert.equal(priorStreak({ toString: { held: 6, atRace: 21 } }, 'toString', 21), 6, 'own key only');
  assert.equal(priorStreak({}, 'toString', 21), 0, 'Object.prototype is not a streak');
  assert.equal(priorStreak({ x: { held: '6', atRace: 21 } }, 'x', 21), 0, 'malformed entry ignored');
});

test('a sale records the run and drops old windows', () => {
  const before = { old: { held: 3, atRace: 19 }, other: { held: 2, atRace: 21 } };
  assert.deepEqual(streaksAfterSale(before, { driverId: 'verstappen', racesHeld: 3 }, 21),
    { other: { held: 2, atRace: 21 }, verstappen: { held: 3, atRace: 21 } });
  assert.deepEqual(streaksAfterSale(undefined, { driverId: 'v', racesHeld: 2, streakBefore: 4 }, 21),
    { v: { held: 6, atRace: 21 } }, 'a re-bought driver adds to the run it came in with');
  assert.equal(streaksAfterSale({ old: { held: 3, atRace: 19 } }, { driverId: 'v', racesHeld: 0 }, 21), null,
    'bought and sold before a race, nothing carried: nothing to keep');
  assert.deepEqual(streaksAfterSale(undefined, { driverId: 'v', racesHeld: 0, streakBefore: 4 }, 21),
    { v: { held: 4, atRace: 21 } }, 're-bought and sold again in one window: the run stands');
});

test('the dodge is closed: hold 5, sell, re-buy → at most 1 more, then locked out', () => {
  let streaks = streaksAfterSale(undefined, { driverId: 'v', racesHeld: 5 }, 10);
  const prior = priorStreak(streaks, 'v', 10);
  assert.equal(allowedContractLength(6, 20, prior), 1);
  // sold again before the race with nothing held since: still five, one allowed
  streaks = streaksAfterSale(streaks, { driverId: 'v', racesHeld: 0, streakBefore: prior }, 10);
  assert.equal(allowedContractLength(6, 20, priorStreak(streaks, 'v', 10)), 1);
  // after a race without him, a fresh run
  assert.equal(allowedContractLength(6, 20, priorStreak(streaks, 'v', 11)), 6);
});

// ─── auto-fill ───

const MARKET = [
  { id: 'a', name: 'A', shortName: 'A', constructorId: 'x', price: 10, form: 9 },
  { id: 'b', name: 'B', shortName: 'B', constructorId: 'x', price: 10, form: 8 },
  { id: 'c', name: 'C', shortName: 'C', constructorId: 'y', price: 10, form: 7 },
];
const CTORS = [{ id: 'x', name: 'X', shortName: 'X', price: 10, form: 5 }];
const held = (id) => ({ driverId: id, name: id, racesHeld: 2, contractLength: 3, currentPrice: 10, purchasePrice: 10 });
const TEAM = { drivers: [held('d1'), held('d2'), held('d3'), held('d4')], constructor: { constructorId: 'x', racesHeld: 1 }, budget: 100, scoredRaces: ['r'] };

test('auto-fill: contract clamped to the races left', () => {
  const plan = planAutoFill(TEAM, { drivers: MARKET, constructors: CTORS, completedRaceCount: 22, racesLeft: 1, formRaceIds: [] });
  const added = plan.drivers.find((d) => d.driverId === 'a');
  assert.equal(added.contractLength, 1);
  const plan2 = planAutoFill(TEAM, { drivers: MARKET, constructors: CTORS, completedRaceCount: 10, racesLeft: 14, formRaceIds: [] });
  assert.equal(plan2.drivers.find((d) => d.driverId === 'a').contractLength, 3, 'mid-season: the default');
});

test('auto-fill: skips a driver at a full run, carries a partial one', () => {
  const team = { ...TEAM, driverStreaks: { a: { held: 6, atRace: 10 }, b: { held: 4, atRace: 10 } } };
  const plan = planAutoFill(team, { drivers: MARKET, constructors: CTORS, completedRaceCount: 10, racesLeft: 14, formRaceIds: [] });
  assert.deepEqual(plan.filledDriverIds, ['b']);
  const b = plan.drivers.find((d) => d.driverId === 'b');
  assert.equal(b.contractLength, 2);
  assert.equal(b.streakBefore, 4);
});

test('auto-fill: no racesLeft in the context (no readable season) keeps the default', () => {
  const plan = planAutoFill(TEAM, { drivers: MARKET, constructors: CTORS, completedRaceCount: 10, formRaceIds: [] });
  assert.equal(plan.drivers.find((d) => d.driverId === 'a').contractLength, 3);
});

// ─── the callables and rules (source pins: these run against Firestore) ───

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('every purchase path clamps the length; the driver paths check the run', () => {
  const ops = src('src/teams/teamOperations.ts');
  const section = (name) => { const i = ops.indexOf(`export const ${name}`); return ops.slice(i, ops.indexOf('\n});\n', i)); };
  for (const name of ['addDriverSecure', 'buildTeamSecure']) {
    const s = section(name);
    assert.match(s, /getSeasonClock\(\)/, `${name} reads the season clock`);
    assert.match(s, /priorStreak\(team\.driverStreaks, /, `${name} reads the run`);
    assert.match(s, /if \(contractLength === 0\) throw streakLockedOut/, `${name} refuses a full run`);
    assert.match(s, /streakBefore: prior/, `${name} carries the run onto the new row`);
  }
  assert.match(section('buildTeamSecure'), /completedRaceCount < lockExpiry/, 'a rebuilt roster honours the expiry lockout too');
  assert.match(section('setConstructorSecure'), /allowedContractLength\(validateContractLength\(data\.contractLength\), racesLeft\)/);
  const rm = section('removeDriverSecure');
  assert.match(rm, /driverStreaks: streaksAfterSale\(team\.driverStreaks, driver, completedRaceCount\) \?\? \{\}/);
  assert.match(rm, /tx\.update\(teamRef, updateData\)/, 'update, not set-merge, so stale keys are replaced');
  assert.ok(!/n > MAX_CONTRACT_LENGTH\)/.test(ops), 'too long is clamped, not refused (shipped builds send 3)');
});

test('driverStreaks is server-owned in the rules', () => {
  assert.match(src('../firestore.rules'), /'racesSinceTransfer', 'driverLockouts', 'driverStreaks',/);
});
