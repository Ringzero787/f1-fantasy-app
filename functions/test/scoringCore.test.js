// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { LOCK_BONUS, calculateLockBonus } = require('../lib/scoring/scoringCore.js');

test('full-season bonus fires at Abu Dhabi for a driver held from round 1', () => {
  // 23 scored races; live scoring evaluates the bonus pre-increment, so a
  // driver held from Australia arrives at Abu Dhabi with held = 22.
  assert.equal(LOCK_BONUS.FULL_SEASON_RACES, 23);
  assert.equal(calculateLockBonus(22), LOCK_BONUS.FULL_SEASON_BONUS);
  assert.notEqual(calculateLockBonus(21), LOCK_BONUS.FULL_SEASON_BONUS);
  assert.equal(calculateLockBonus(23), LOCK_BONUS.FULL_SEASON_BONUS);
});
