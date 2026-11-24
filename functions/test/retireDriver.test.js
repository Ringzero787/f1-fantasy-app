// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-155: retiring a driver a team holds (the 2027 grid seed, F-156, with the market open since the
// rollover). What the team write carries, and when the retirement must not write.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { retireSale, holdsDriver, retireBlockers, retireBackupPaths } = require('../lib/teams/retireDriver.js');

const team = (over = {}) => ({
  userId: 'u1', name: 'Pedal', budget: 40, totalSpent: 960, totalPoints: 300, lockedPoints: 100, racesSinceTransfer: 4,
  drivers: [
    { driverId: 'ocon', purchasePrice: 150, currentPrice: 160, pointsScored: 25, racesHeld: 2, contractLength: 3 },
    { driverId: 'gasly', purchasePrice: 200, currentPrice: 210, pointsScored: 10 },
  ],
  constructor: { constructorId: 'haas', purchasePrice: 90 },
  aceDriverId: 'ocon',
  driverLockouts: { ocon: 3, piastri: 5 },
  driverStreaks: { ocon: { held: 2, atRace: 1 }, norris: { held: 6, atRace: 1 } },
  ...over,
});

test('a holder gets his current market price back, whole, and his points banked as in a sale', () => {
  const s = retireSale(team(), 'ocon', 256);
  assert.equal(s.refund, 256, 'the market price, no early-termination fee');
  assert.deepEqual(s.patch.drivers.map((d) => d.driverId), ['gasly']);
  assert.equal(s.patch.budget, 40 + 256);
  assert.equal(s.patch.totalSpent, 960 - 150);
  assert.equal(s.banked, 25);
  assert.equal(s.patch.totalPoints + s.patch.lockedPoints, 300 + 100, 'the season total — and every league table — is unchanged');
  assert.deepEqual([s.patch.totalPoints, s.patch.lockedPoints], [275, 125]);
});

test('his ace slot, lockout and streak entry are cleared; everyone else\'s are kept whole', () => {
  const s = retireSale(team(), 'ocon', 256);
  assert.equal(s.patch.aceDriverId, null);
  assert.deepEqual(s.patch.driverLockouts, { piastri: 5 });
  assert.deepEqual(s.patch.driverStreaks, { norris: { held: 6, atRace: 1 } });
  assert.ok(s.aceCleared && s.lockoutCleared && s.streakCleared && s.onRoster);
});

test('racesSinceTransfer, the constructor and the team\'s identity are not in the write', () => {
  const s = retireSale(team(), 'ocon', 256);
  for (const k of ['racesSinceTransfer', 'constructor', 'userId', 'name', 'isLocked', 'lockStatus']) assert.ok(!Object.prototype.hasOwnProperty.call(s.patch, k), k);
  const noAce = retireSale(team({ aceDriverId: 'gasly', driverLockouts: undefined, driverStreaks: undefined }), 'ocon', 256);
  assert.deepEqual(Object.keys(noAce.patch).sort(), ['budget', 'drivers', 'lockedPoints', 'totalPoints', 'totalSpent'], 'only what the sale changes');
  const unscored = retireSale(team({ drivers: [{ driverId: 'ocon', purchasePrice: 150, pointsScored: 0 }], aceDriverId: null, driverLockouts: {}, driverStreaks: {} }), 'ocon', 160);
  assert.deepEqual(Object.keys(unscored.patch).sort(), ['budget', 'drivers', 'totalSpent'], 'the off-season: nothing scored, no points move');
});

test('a team that only has his ace, lockout or streak entry is cleared with no refund; a team without him is not touched', () => {
  const lockoutOnly = retireSale(team({ drivers: [], aceDriverId: null, driverStreaks: {} }), 'ocon', 256);
  assert.equal(lockoutOnly.refund, 0);
  assert.deepEqual(lockoutOnly.patch, { driverLockouts: { piastri: 5 } });
  assert.equal(retireSale(team({ drivers: [], aceDriverId: null, driverLockouts: {}, driverStreaks: {} }), 'ocon', 256), null, 'a re-run finds nothing to do');
  assert.equal(holdsDriver(team(), 'verstappen'), false);
  assert.equal(holdsDriver({ drivers: [{ id: 'ocon' }] }, 'ocon'), true, 'an old roster entry keyed by id');
  assert.equal(holdsDriver({ driverLockouts: Object.create({ ocon: 1 }) }, 'ocon'), false, 'own keys only');
});

test('no usable market price → the roster entry\'s current price', () => {
  assert.equal(retireSale(team(), 'ocon', undefined).refund, 160);
  assert.equal(retireSale(team(), 'ocon', NaN).refund, 160);
  assert.equal(retireSale(team(), 'ocon', -5).refund, 160);
});

test('a live weekend or an open Moonshot blocks the start; a locked holder does not (it is skipped per team)', () => {
  assert.deepEqual(retireBlockers({ weekendLive: false, openMoonshots: [] }), []);
  assert.equal(retireBlockers({ weekendLive: true, openMoonshots: ['m1'] }).length, 2);
});

test('a holder matched on an old entry\'s `id` (no driverId) is taken off and refunded', () => {
  const s = retireSale({ budget: 0, totalSpent: 100, drivers: [{ id: 'ocon', purchasePrice: 100, currentPrice: 90 }, { driverId: 'gasly' }] }, 'ocon', 120);
  assert.deepEqual([s.onRoster, s.refund, s.patch.budget, s.patch.totalSpent], [true, 120, 120, 0]);
  assert.deepEqual(s.patch.drivers, [{ driverId: 'gasly' }]);
});

test('the op backup names the two drivers and the holding teams, never the whole collection', () => {
  assert.deepEqual(retireBackupPaths('ocon', 'newbie', ['t1', 't2']), ['drivers/ocon', 'drivers/newbie', 'fantasyTeams/t1', 'fantasyTeams/t2']);
  assert.deepEqual(retireBackupPaths('ocon', null, []), ['drivers/ocon']);
});

test('the script writes each team with set + mergeFields, never update() (#305)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'setDriverSeat.js'), 'utf8');
  assert.match(src, /tx\.set\(teamRef, data, \{ mergeFields: Object\.keys\(data\)/);
  assert.doesNotMatch(src, /tx\.update\(teamRef/);
});
