// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRaceSnapshot, entityPhasePoints, snapshotWeekendPoints } = require('../lib/scoring/raceSnapshots.js');
const { rankRaceEntries, countRaceWins, raceWinWrites } = require('../lib/scoring/leagueRaceResults.js');

const D = (driverId, pointsScored, extra = {}) => ({ driverId, constructorId: 'team_a', purchasePrice: 100, currentPrice: 110, contractLength: 5, racesHeld: 2, pointsScored, ...extra });
const team = { userId: 'u1', leagueId: 'L1', aceDriverId: 'avery', budget: 42, drivers: [D('avery', 50), D('blake', 20, { isReservePick: true })] };
const ctorBefore = { constructorId: 'team_a', purchasePrice: 300, currentPrice: 320, contractLength: 4, racesHeld: 1, pointsScored: 80 };

function raceSnapshot(teamPoints = 61) {
  return buildRaceSnapshot({
    teamId: 't1', team, constructorBefore: ctorBefore, raceId: 'round_9', season: 2026, round: 9, phase: 'race', teamPoints,
    driversAfter: [D('avery', 86), D('blake', 25)], constructorAfter: { ...ctorBefore, pointsScored: 105 }, scoredAt: 'T',
  });
}

test('snapshot captures the roster as fielded, the Ace, and per-entity points from pointsScored deltas', () => {
  const s = raceSnapshot(36 + 5 + 25 - 5);
  assert.equal(s.season, '2026');
  assert.equal(s.round, 9);
  assert.deepEqual(s.roster.drivers.map((d) => [d.driverId, d.isReservePick, d.racesHeld]), [['avery', false, 2], ['blake', true, 2]]);
  assert.equal(s.roster.aceDriverId, 'avery');
  assert.equal(s.roster.aceConstructorId, null);
  assert.equal(s.roster.constructor.constructorId, 'team_a');
  assert.deepEqual(s.phases.race.entities, { avery: 36, blake: 5, team_a: 25 });
  assert.equal(s.phases.race.points, 61);
  // 61 scored, 66 earned by entities: the stale-roster penalty shows up as the adjustment
  assert.equal(s.phases.race.adjustment, -5);
});

test('a phase document only carries its own phase, so merging keeps the others', () => {
  const quali = buildRaceSnapshot({ teamId: 't1', team, constructorBefore: ctorBefore, raceId: 'round_9', season: '2026', round: 9, phase: 'qualifying', teamPoints: 7,
    driversAfter: [D('avery', 54), D('blake', 23)], constructorAfter: ctorBefore, scoredAt: 'T' });
  assert.deepEqual(Object.keys(quali.phases), ['qualifying']);
  assert.equal(quali.phases.qualifying.adjustment, undefined);
  const merged = { ...quali, phases: { ...quali.phases, ...raceSnapshot().phases } };
  assert.equal(snapshotWeekendPoints(merged), 7 + 61);
});

test('no constructor, a swapped constructor and damaged numbers are handled', () => {
  const none = buildRaceSnapshot({ teamId: 't', team: { drivers: [] }, constructorBefore: null, raceId: 'r', season: null, round: undefined, phase: 'sprint', teamPoints: NaN, driversAfter: [], constructorAfter: null, scoredAt: 'T' });
  assert.equal(none.roster.constructor, null);
  assert.equal(none.phases.sprint.points, 0);
  assert.equal(none.season, null);
  assert.equal(none.round, null);
  // a different constructor after than before starts from zero, not from the old one's total
  assert.deepEqual(entityPhasePoints([], [], { constructorId: 'old', pointsScored: 90 }, { constructorId: 'new', pointsScored: 12 }), { new: 12 });
  assert.equal(snapshotWeekendPoints(null), 0);
  assert.equal(snapshotWeekendPoints({ phases: { race: { points: 'x' }, sprint: { points: 4 } } }), 4);
});

test('race entries rank by points with shared ranks, and every tied leader wins', () => {
  const r = rankRaceEntries([{ userId: 'c', points: 40 }, { userId: 'a', points: 88 }, { userId: 'b', points: 88, displayName: 'Bee' }, { userId: 'd', points: -3 }]);
  assert.deepEqual(r.entries.map((e) => [e.userId, e.rank]), [['a', 1], ['b', 1], ['c', 3], ['d', 4]]);
  assert.deepEqual(r.winners, ['a', 'b']);
  assert.equal(r.topPoints, 88);
  assert.equal(r.entries[1].displayName, 'Bee');
});

test('a weekend nobody scored in has no winner', () => {
  assert.deepEqual(rankRaceEntries([{ userId: 'a', points: 0 }, { userId: 'b', points: 0 }]).winners, []);
  assert.deepEqual(rankRaceEntries([]).winners, []);
  assert.equal(rankRaceEntries([]).topPoints, null);
});

test('race wins are counted from stored results, so a repeated scoring run cannot double count', () => {
  const stored = [
    { season: '2026', winners: ['a', 'b'] },
    { season: '2026', winners: ['a'] },
    { season: '2026', winners: ['c'], estimated: true }, // backfilled estimate: never counts
    { season: '2025', winners: ['b'] },
    { season: '2026', winners: 'corrupt' },
  ];
  const once = countRaceWins(stored, '2026');
  assert.deepEqual([...once].sort(), [['a', 2], ['b', 1]]);
  // scoring the same race again rewrites the same document: the count is identical
  const again = countRaceWins(stored, '2026');
  assert.deepEqual([...again].sort(), [...once].sort());
  // writes only where the stored number is wrong, and a lost win goes back to 0
  const writes = raceWinWrites(['a', 'b', 'c', 'd'], once, new Map([['a', 2], ['b', 0], ['c', 1], ['d', undefined]]));
  assert.deepEqual(writes, [{ id: 'b', raceWins: 1 }, { id: 'c', raceWins: 0 }, { id: 'd', raceWins: 0 }]);
});
