// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { orderMembers, rankWrites, bestRaceUpdate } = require('../lib/scoring/standingsFields.js');

const M = (id, totalPoints, lastRacePoints, extra = {}) => ({ id, totalPoints, lastRacePoints, ...extra });

test('orderMembers: total desc, last race desc, id asc', () => {
  const out = orderMembers([M('c', 10, 9), M('b', 10, 5), M('a', 10, 5), M('z', 50, 0)]);
  assert.deepEqual(out.map((m) => m.id), ['z', 'c', 'a', 'b']);
});

test('rankWrites snapshots previousRank on the first pass of a weekend only', () => {
  const before = [M('u1', 1284, 86, { rank: 2, previousRank: 3, previousRankRaceId: 'monza_2026' }), M('u2', 1251, 71, { rank: 1, previousRank: 1, previousRankRaceId: 'monza_2026' })];
  const first = rankWrites(before, 'baku_2026');
  assert.deepEqual(first, [
    { id: 'u1', data: { rank: 1, previousRank: 2, previousRankRaceId: 'baku_2026' } },
    { id: 'u2', data: { rank: 2, previousRank: 1, previousRankRaceId: 'baku_2026' } },
  ]);
  // second pass the same weekend (e.g. the race after quali): ranks only
  const mid = before.map((m, i) => ({ ...m, ...first[i].data }));
  const second = rankWrites(mid, 'baku_2026');
  assert.deepEqual(second, [{ id: 'u1', data: { rank: 1 } }, { id: 'u2', data: { rank: 2 } }]);
});

test('rankWrites: a newly ranked member gets no previousRank; repairs write rank only', () => {
  const w = rankWrites([M('new', 5, 5), M('old', 9, 9, { rank: 1, previousRankRaceId: 'x' })], 'baku_2026');
  assert.deepEqual(w[0], { id: 'old', data: { rank: 1, previousRank: 1, previousRankRaceId: 'baku_2026' } });
  assert.deepEqual(w[1], { id: 'new', data: { rank: 2, previousRankRaceId: 'baku_2026' } });
  assert.deepEqual(rankWrites([M('a', 1, 1, { rank: 1 })]), [{ id: 'a', data: { rank: 1 } }]);
});

test('bestRaceUpdate promotes only a new best', () => {
  assert.deepEqual(bestRaceUpdate({}, 'r1', 40), { bestRacePoints: 40, bestRaceId: 'r1' });
  assert.deepEqual(bestRaceUpdate({ bestRacePoints: 40 }, 'r2', 55), { bestRacePoints: 55, bestRaceId: 'r2' });
  assert.deepEqual(bestRaceUpdate({ bestRacePoints: 55 }, 'r3', 55), {});
  assert.deepEqual(bestRaceUpdate({ bestRacePoints: 55 }, 'r4', -3), {});
  assert.deepEqual(bestRaceUpdate({ bestRacePoints: null }, 'r5', 0), { bestRacePoints: 0, bestRaceId: 'r5' });
});
