// F-107: the settlement decision, the season cap, the cash clamp and the stats are pure and tested here.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test', storageBucket: 'demo-uc-test.appspot.com' });
const { mergeConfig } = require('../lib/moonshot/config.js');
const { settleDecision, predictionHit, capHit, clampCash, settlementIdFor, nextStats, SETTLEMENT_VERSION, SETTLEABLE_STATUSES } = require('../lib/moonshot/settlement.js');
const { rankRaceEntries } = require('../lib/scoring/leagueRaceResults.js');
const index = require('../lib/index.js');

const cfg = mergeConfig({ enabled: true });
const call = (predictionType, extra = {}) => ({ predictionType, predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 100, potentialReward: 500, ...extra });

test('predictions: every type against every position that matters', () => {
  assert.ok(predictionHit('WIN', 1)); assert.ok(!predictionHit('WIN', 2));
  assert.ok(predictionHit('PODIUM', 3)); assert.ok(!predictionHit('PODIUM', 4));
  assert.ok(predictionHit('TOP_5', 5)); assert.ok(!predictionHit('TOP_5', 6));
  assert.ok(predictionHit('EXACT_FINISH', 7, 7)); assert.ok(!predictionHit('EXACT_FINISH', 6, 7)); assert.ok(!predictionHit('EXACT_FINISH', 7, null));
});

test('a finisher is compared with the prediction: a hit pays the reward, a miss takes the stake', () => {
  assert.deepEqual(settleDecision(call('PODIUM'), { position: 3, status: 'finished' }, cfg),
    { result: 'HIT', officialDriverFinish: 3, driverStatus: 'finished', adjustmentAmount: 500 });
  assert.deepEqual(settleDecision(call('WIN'), { position: 2, status: 'finished' }, cfg),
    { result: 'MISSED', officialDriverFinish: 2, driverStatus: 'finished', adjustmentAmount: -100 });
  assert.equal(settleDecision(call('EXACT_FINISH', { predictionTarget: 9 }), { position: 9, status: 'finished' }, cfg).result, 'HIT');
});

test('DNF / DNS / DSQ / not classified / cancelled follow the configured rules, and a void adjusts nothing', () => {
  const d = (driver, c = cfg, cancelled = false) => settleDecision(call('TOP_5'), driver, c, cancelled);
  assert.deepEqual([d({ position: 0, status: 'dnf' }).result, d({ position: 0, status: 'dnf' }).adjustmentAmount], ['MISSED', -100]);   // DNF = LOSS
  assert.deepEqual([d({ status: 'dns' }).result, d({ status: 'dns' }).adjustmentAmount], ['VOID', 0]);                                  // DNS = VOID
  assert.equal(d({ position: 4, status: 'dsq' }).result, 'MISSED');                                                                    // DSQ = LOSS, even from P4
  assert.equal(d({ position: 0, status: 'nc' }).result, 'MISSED');                                                                     // ran, not classified → the DNF rule
  assert.equal(d(undefined).result, 'VOID');                                                                                             // not in the classification at all → DNS rule
  assert.equal(d(undefined).driverStatus, 'missing');
  assert.deepEqual([d({ position: 1, status: 'finished' }, cfg, true).result, d({ position: 1 }, cfg, true).driverStatus], ['VOID', 'cancelled']);   // cancelled race voids even a P1
  const flipped = mergeConfig({ enabled: true, dnfRule: 'VOID', dnsRule: 'LOSS', dsqRule: 'VOID', cancelledRule: 'LOSS' });
  assert.equal(d({ status: 'dnf' }, flipped).result, 'VOID');
  assert.equal(d({ status: 'dns' }, flipped).result, 'MISSED');
  assert.equal(d({ position: 2, status: 'dsq' }, flipped).result, 'VOID');
  assert.equal(d({ position: 2, status: 'finished' }, flipped, true).result, 'MISSED');
  assert.equal(d({ status: 'finished' }).result, 'MISSED');   // a "finisher" with no position cannot be compared: the DNF rule
});

test('the season cap pays a hit up to the cap and marks it; misses are never capped', () => {
  assert.deepEqual(capHit(500, 0, 1500), { paid: 500, capped: false });
  assert.deepEqual(capHit(500, 1200, 1500), { paid: 300, capped: true });
  assert.deepEqual(capHit(500, 1500, 1500), { paid: 0, capped: true });
  assert.deepEqual(capHit(-100, 1500, 1500), { paid: -100, capped: false });
});

test('cash never goes below zero; a miss larger than the bank is a shortfall', () => {
  assert.deepEqual(clampCash(240, 500), { budget: 740, applied: 500, shortfall: false });
  assert.deepEqual(clampCash(240, -100), { budget: 140, applied: -100, shortfall: false });
  assert.deepEqual(clampCash(60, -100), { budget: 0, applied: -60, shortfall: true });
});

test('the settlement id is one per season, race, call and version', () => {
  assert.equal(settlementIdFor('2026', 'singapore_2026', 'm1'), `2026:singapore_2026:m1:v${SETTLEMENT_VERSION}`);
  assert.notEqual(settlementIdFor('2026', 'singapore_2026', 'm1', 2), settlementIdFor('2026', 'singapore_2026', 'm1', 1));
  assert.deepEqual([...SETTLEABLE_STATUSES], ['CONFIRMED', 'LOCKED', 'LIVE']);   // settled and cancelled calls are never picked up again
});

test('season stats accumulate per currency, count voids apart, and remember the biggest hit', () => {
  const c = { ...call('PODIUM'), id: 'm1', driverId: 'hadjar', raceId: 'austin_2026' };
  let s = nextStats(undefined, c, 'HIT', 500);
  assert.deepEqual([s.used, s.hit, s.pointsRisked, s.pointsWon, s.biggestHit.moonshotId], [1, 1, 100, 500, 'm1']);
  s = nextStats(s, { ...c, id: 'm2', stakeCurrency: 'CASH', stakeAmount: 200, potentialReward: 1000 }, 'MISSED', -200);
  assert.deepEqual([s.used, s.missed, s.cashRisked, s.cashWon, s.pointsWon], [2, 1, 200, 0, 500]);
  s = nextStats(s, { ...c, id: 'm3' }, 'VOID', 0);
  assert.deepEqual([s.used, s.voided], [2, 1]);   // a void spends nothing
  s = nextStats(s, { ...c, id: 'm4', potentialReward: 800 }, 'HIT', 300);   // capped hit: the paid amount is what counts
  assert.deepEqual([s.pointsWon, s.biggestHit.moonshotId], [800, 'm1']);
});

test('race entries carry race points, Moonshot points and the race total; ranking and wins stay on race points', () => {
  const r = rankRaceEntries([{ userId: 'a', points: 187, moonshotPoints: 500 }, { userId: 'b', points: 190 }, { userId: 'c', points: 50, moonshotPoints: -100 }]);
  assert.deepEqual(r.entries.map((e) => [e.userId, e.racePoints, e.moonshotPoints, e.raceTotal, e.rank]), [['b', 190, 0, 190, 1], ['a', 187, 500, 687, 2], ['c', 50, -100, -50, 3]]);
  assert.deepEqual(r.winners, ['b']);
});

test('the cancelled-race trigger is exported', () => {
  assert.equal(typeof index.onRaceCancelled, 'function');
});
