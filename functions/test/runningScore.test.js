// F-129. The running score: the race-session formula applied to the current order, nothing more.
const test = require('node:test');
const assert = require('node:assert/strict');
const { runningScore, GRID_FALLBACK } = require('../lib/scoring/runningScore.js');
const { calculateDriverPoints, constructorRacePoints, RACE_POINTS, GRID_SIZE } = require('../lib/scoring/scoringCore.js');

const ctorOf = { norris: 'mclaren', piastri: 'mclaren', verstappen: 'red_bull', hadjar: 'racing_bulls' };

test('a driver scores what calculateDriverPoints gives a finisher at that position: points, places, reverse grid', () => {
  const r = runningScore({ norris: 1, verstappen: 2, piastri: 5 }, { norris: 3, verstappen: 1, piastri: 5 }, null, ctorOf);
  assert.equal(r.drivers.norris, 45 + 2 + 22);          // P1 from P3: two gained
  assert.equal(r.drivers.verstappen, 37 - 1 + 21);      // P2 from P1: one lost
  assert.equal(r.drivers.piastri, 26 + 0 + 18);         // held station
  for (const [id, pos] of Object.entries({ norris: 1, verstappen: 2, piastri: 5 })) {
    const grid = { norris: 3, verstappen: 1, piastri: 5 }[id];
    assert.equal(r.drivers[id], calculateDriverPoints({ position: pos, driverId: id, constructorId: ctorOf[id], gridPosition: grid, status: 'finished', fastestLap: false }, null, 0, false), id);
  }
});

test('the fastest lap is a point inside the top ten only', () => {
  const grid = { norris: 1, hadjar: 11 };
  assert.equal(runningScore({ norris: 1 }, grid, 'norris', ctorOf).drivers.norris, runningScore({ norris: 1 }, grid, null, ctorOf).drivers.norris + 1);
  assert.equal(runningScore({ hadjar: 11 }, grid, 'hadjar', ctorOf).drivers.hadjar, runningScore({ hadjar: 11 }, grid, null, ctorOf).drivers.hadjar);
});

test('no grid yet: nobody gains or loses places; a known grid missing a car starts it from the back', () => {
  assert.equal(runningScore({ norris: 4 }, {}, null, ctorOf).drivers.norris, RACE_POINTS[3] + (GRID_SIZE + 1 - 4));
  const partial = runningScore({ norris: 4, hadjar: 12 }, { norris: 4 }, null, ctorOf);
  assert.equal(partial.drivers.hadjar, RACE_POINTS[11] + (GRID_FALLBACK - 12) + (GRID_SIZE + 1 - 12));
});

test('a constructor is both cars\' position points and reverse-grid bonus, with no places and no fastest lap', () => {
  const r = runningScore({ norris: 1, piastri: 2, verstappen: 3 }, { norris: 5, piastri: 6, verstappen: 1 }, 'norris', ctorOf);
  assert.equal(r.constructors.mclaren, (45 + 22) + (37 + 21));
  assert.equal(r.constructors.red_bull, 33 + 20);
  assert.equal(r.constructors.mclaren, constructorRacePoints(1) + constructorRacePoints(2));
  assert.deepEqual([constructorRacePoints(21), constructorRacePoints(23), constructorRacePoints(0)], [2, 0, 0]);   // P21: reverse grid only; off the grid or unplaced: nothing
  assert.equal(r.constructors.racing_bulls, undefined, 'no car on track, no entry');
});

test('a driver with no constructor still scores, scores for no constructor; a bad position is skipped', () => {
  const r = runningScore({ ghost: 7, norris: 0, piastri: 2.5 }, {}, null, ctorOf);
  assert.deepEqual(Object.keys(r.drivers), ['ghost']);
  assert.deepEqual(r.constructors, {});
});

test('a retired car at the back of the order is scored as a finisher there, not with the DNF penalty', () => {
  // the honest limit: the feed has no retirement flag; it drops a stopped car to the back (United States 2026, session 11396:
  // the three retirements ended P20–P22, no shared positions), so the number carries the back-marker's points until the classification
  const r = runningScore({ hadjar: 20 }, { hadjar: 8 }, null, ctorOf);
  assert.equal(r.drivers.hadjar, 1 - 12 + 3);
});
