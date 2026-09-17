// Settlement and pricing math, tested against the compiled functions (lib/).
// Run: npm --prefix newgame/functions run build && node --test newgame/functions/test/*.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

// settleWeekend.ts creates its Firestore client when it loads; an app with a
// dummy project id satisfies that. Nothing here talks to the network.
admin.initializeApp({ projectId: 'demo-tracklimits-test' });
const sw = require('../lib/triggers/settleWeekend.js');
const { offeredOddsFromFairProb, BOOK_VIG } = require('../lib/triggers/_odds.js');

const line = (over = {}) => ({ entityId: 'x', entityKind: 'driver', predictedLo: 3, predictedHi: 6, withOdds: 1.9, againstOdds: 1.9, ...over });

test('constants the app and economy depend on', () => {
  assert.deepEqual(sw.SESSION_WEIGHT, { race: 1, qualifying: 0.5, sprint: 0.25 });
  assert.equal(sw.WIN_BONUS, 10);
  assert.equal(sw.LOSS_PENALTY, 10);
  assert.equal(sw.BEST_BET_PROFIT_MULT, 1.5);
  assert.equal(sw.BEST_BET_LOSS_POINTS, -1);
  assert.equal(sw.FIELD_SIZE, 22);
  assert.equal(sw.STAKE_BONUS_RATE, 0.5);
  assert.equal(sw.STAKE_BONUS_MAX, 25);
});

test('decideOutcome: WITH iff the result is inside [lo, hi], bounds inclusive', () => {
  assert.equal(sw.decideOutcome(line(), 3), 'with');
  assert.equal(sw.decideOutcome(line(), 6), 'with');
  assert.equal(sw.decideOutcome(line(), 2), 'against');
  assert.equal(sw.decideOutcome(line(), 7), 'against');
});

test('legacy lines: a lone `line` settles on ±1; no range at all never lets WITH win', () => {
  const legacy = { entityId: 'x', entityKind: 'driver', line: 5, withOdds: 1.9, againstOdds: 1.9 };
  assert.equal(sw.lineLo(legacy), 4);
  assert.equal(sw.lineHi(legacy), 6);
  assert.equal(sw.decideOutcome(legacy, 7), 'against');
  const empty = { entityId: 'x', entityKind: 'driver', withOdds: 1.9, againstOdds: 1.9 };
  assert.equal(sw.decideOutcome(empty, 1), 'against');
});

test('computePayout: stake × odds plus the win bonus; stake plus penalty on a loss', () => {
  // stake 10 × 1.9 = 19, bonus 10 + 50% of 10 = 15 → 34.
  assert.deepEqual(sw.computePayout({ side: 'with', stake: 10 }, line(), 'with'), { won: true, payout: 34, pointsCredit: 1 });
  assert.deepEqual(sw.computePayout({ side: 'with', stake: 10 }, line(), 'against'), { won: false, payout: 0, pointsCredit: 0, penalty: 10 });
  // A free call is untouched by F-043: still exactly WIN_BONUS.
  assert.deepEqual(sw.computePayout({ side: 'against', stake: 0 }, line(), 'against'), { won: true, payout: 10, pointsCredit: 1 });
});

test('stake bonus (F-043): 50% of stake on top, capped at $25, free calls unchanged', () => {
  assert.equal(sw.winBonus(0), 10);
  assert.equal(sw.winBonus(10), 15);
  assert.equal(sw.winBonus(25), 22.5);
  // The cap binds exactly at a $50 stake and never grows past it.
  assert.equal(sw.winBonus(50), 35);
  assert.equal(sw.winBonus(100), 35);
  assert.equal(sw.winBonus(1e6), 35);
  // Defensive: a missing or negative stake can never pay more than the flat bonus.
  assert.equal(sw.winBonus(undefined), 10);
  assert.equal(sw.winBonus(-50), 10);
  // End to end: stake 50 × 1.9 = 95, plus the capped 35 → 130.
  assert.deepEqual(sw.computePayout({ side: 'with', stake: 50 }, line(), 'with'), { won: true, payout: 130, pointsCredit: 1 });
  // A loss pays nothing regardless of how big the stake was.
  assert.deepEqual(sw.computePayout({ side: 'with', stake: 100 }, line(), 'against'), { won: false, payout: 0, pointsCredit: 0, penalty: 10 });
});

test('best bets: AGAINST profit ×1.5 on a win, −1 point on a staked loss; WITH unchanged', () => {
  const bb = line({ bestBet: true });
  // base 10 × 1.9 = 19 → stake 10 + profit 9 × 1.5 = 23.5, plus the 15 bonus.
  // The bonus itself is never multiplied by BEST_BET_PROFIT_MULT.
  assert.deepEqual(sw.computePayout({ side: 'against', stake: 10 }, bb, 'against'), { won: true, payout: 38.5, pointsCredit: 1 });
  assert.deepEqual(sw.computePayout({ side: 'against', stake: 10 }, bb, 'with'), { won: false, payout: 0, pointsCredit: -1, penalty: 10 });
  assert.deepEqual(sw.computePayout({ side: 'against', stake: 0 }, bb, 'with'), { won: false, payout: 0, pointsCredit: 0, penalty: 10 });
  assert.deepEqual(sw.computePayout({ side: 'with', stake: 10 }, bb, 'with'), { won: true, payout: 34, pointsCredit: 1 });
});

test('buildSessionResults: constructor sums fill in from the roster; a missing position counts as last', () => {
  const rows = [
    { position: 1, driverId: 'a', constructorId: 't1' },
    { position: 4, driverId: 'b' },
    { position: 0, driverId: 'c', constructorId: 't2' },
  ];
  const r = sw.buildSessionResults(rows, { b: 't1', c: 't2' });
  assert.deepEqual(r.driver, { a: 1, b: 4, c: 22 });
  assert.deepEqual(r.constructor, { t1: 5, t2: 22 });
  assert.equal(sw.buildSessionResults([], {}), null);
});

test('sigOfResults: ignores key order, changes when any position changes', () => {
  const one = { race: { driver: { a: 1, b: 2 }, constructor: { t1: 3 } } };
  const same = { race: { driver: { b: 2, a: 1 }, constructor: { t1: 3 } } };
  const corrected = { race: { driver: { a: 2, b: 1 }, constructor: { t1: 3 } } };
  assert.equal(sw.sigOfResults(one), sw.sigOfResults(same));
  assert.notEqual(sw.sigOfResults(one), sw.sigOfResults(corrected));
});

test('offeredOddsFromFairProb: vig on top of fair, capped so odds stay above 1.00', () => {
  assert.equal(BOOK_VIG, 0.05);
  assert.equal(offeredOddsFromFairProb(0.5), 1.9);
  assert.equal(offeredOddsFromFairProb(0.95), 1.01);
  assert.equal(offeredOddsFromFairProb(1), 1.01);
  assert.equal(offeredOddsFromFairProb(0), 1000);
  for (let p = 0.05; p < 1; p += 0.05) {
    const w = offeredOddsFromFairProb(p), a = offeredOddsFromFairProb(1 - p);
    assert.ok(w > 1 && a > 1, `odds above 1.00 at p=${p.toFixed(2)}`);
  }
});
