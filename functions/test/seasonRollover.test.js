// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-150: the season rollover's transforms. What a reset team, league and member look like, how
// opening prices come out, and how a season's race documents are built from the OpenF1 calendar.
// functions/scripts/seasonRollover.js applies exactly these, so a wrong field here is a wrong field
// on every team in production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../lib/season/rollover.js');
const { buildCalendar, CIRCUITS } = require('../lib/season/calendar.js');

// Every field a production team carried on 2026-11-15 (97 teams surveyed), with 2026 values.
const team2026 = () => ({
  userId: 'u1', leagueId: 'L1', name: 'Pedal', createdAt: 'T0', updatedAt: 'T9', avatarUrl: 'a.png', avatarGeneratedAt: 'T1',
  drivers: [{ driverId: 'norris', purchasePrice: 300, racesHeld: 4, contractLength: 6 }, { driverId: 'hadjar' }],
  constructor: { constructorId: 'mclaren', racesHeld: 3 },
  budget: 12, totalSpent: 988, totalPoints: 900, lockedPoints: 3600, moonshotPoints: 79,
  aceDriverId: 'norris', aceConstructorId: null, racesPlayed: 22, racesSinceTransfer: 5,
  pointsHistory: [10, 20], joinedAtRace: 0, raceWins: 3, scoredRaces: ['australia_2026', 'china_2026_sprint'],
  bestRaceId: 'monaco_2026', bestRacePoints: 310, incompleteReminder: { raceId: 'x' },
  isLocked: true, lockStatus: { isSeasonLocked: true, seasonLockRacesRemaining: 4, canModify: false, lockReason: 'season' },
  moonshotStats: { calls: 4 }, driverLockouts: { piastri: 25 },
});

test('a reset team is a new team again: same id, owner, name, league and avatar; nothing else from 2026', () => {
  const patch = R.teamResetPatch(team2026());
  assert.deepEqual(patch.drivers, []);
  assert.equal(patch.constructor, null);
  assert.equal(patch.budget, 1000);
  for (const k of ['totalSpent', 'totalPoints', 'lockedPoints', 'racesPlayed', 'racesSinceTransfer', 'joinedAtRace', 'raceWins']) assert.equal(patch[k], 0, k);
  assert.deepEqual([patch.pointsHistory, patch.scoredRaces], [[], []]);
  assert.deepEqual([patch.aceDriverId, patch.aceConstructorId, patch.isLocked], [null, null, false]);
  assert.deepEqual(patch.lockStatus, { ...R.UNLOCKED_LOCK_STATUS });
  assert.equal(patch.lockStatus.isSeasonLocked, false, 'a 2026 season lock does not follow the team into 2027');
  for (const k of ['bestRaceId', 'bestRacePoints', 'incompleteReminder', 'moonshotPoints', 'moonshotStats', 'driverLockouts']) assert.equal(patch[k], R.DELETE, k);
  for (const k of ['userId', 'leagueId', 'name', 'createdAt', 'avatarUrl', 'avatarGeneratedAt', 'updatedAt']) assert.ok(!(k in patch), `${k} is kept`);
  // every field the team had is accounted for: kept, reset or deleted
  const kept = ['userId', 'leagueId', 'name', 'createdAt', 'updatedAt', 'avatarUrl', 'avatarGeneratedAt'];
  for (const k of Object.keys(team2026())) assert.ok(kept.includes(k) || k in patch, `${k} survives the reset`);
});

test('team creation and the rollover share one unlocked status and one budget', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'teams', 'teamOperations.ts'), 'utf8');
  assert.match(src, /\{ \.\.\.UNLOCKED_LOCK_STATUS \}/);
  assert.match(src, /const BUDGET = START_BUDGET;/);
  assert.ok(Object.isFrozen(R.UNLOCKED_LOCK_STATUS));
});

test('the archive keeps the whole 2026 season of a team', () => {
  const a = R.teamArchive(team2026(), '2026');
  assert.equal(a.season, '2026');
  assert.equal(a.seasonTotal, 900 + 3600 + 79, 'the total the league table ranked');
  assert.deepEqual([a.totalPoints, a.lockedPoints, a.moonshotPoints, a.raceWins, a.racesPlayed], [900, 3600, 79, 3, 22]);
  assert.deepEqual([a.bestRaceId, a.bestRacePoints], ['monaco_2026', 310]);
  assert.deepEqual(a.finalDrivers, ['norris', 'hadjar']);
  assert.equal(a.finalConstructor, 'mclaren');
  assert.deepEqual(a.scoredRaces, ['australia_2026', 'china_2026_sprint']);
  // a team with no constructor field: Object.prototype.constructor must not leak in
  const bare = R.teamArchive({ name: 'x' }, '2026');
  assert.deepEqual([bare.finalConstructor, bare.seasonTotal, bare.finalDrivers], [null, 0, []]);
});

test('league archive: final order and champion; a shared top score is a shared title; nobody scored → no champion', () => {
  const m = (id, totalPoints, extra = {}) => ({ id, userId: `u_${id}`, displayName: id.toUpperCase(), totalPoints, raceWins: 1, ...extra });
  const a = R.leagueArchive({ name: 'L', raceResultIds: ['r1'] }, [m('b', 300), m('a', 500), m('c', 100)], '2026');
  assert.deepEqual(a.standings.map((s) => [s.memberId, s.rank, s.totalPoints]), [['a', 1, 500], ['b', 2, 300], ['c', 3, 100]]);
  assert.deepEqual(a.champions, [{ userId: 'u_a', displayName: 'A' }]);
  assert.deepEqual(a.raceResultIds, ['r1']);
  const tie = R.leagueArchive({}, [m('a', 500, { lastRacePoints: 1 }), m('b', 500, { lastRacePoints: 9 })], '2026');
  assert.deepEqual(tie.champions.map((c) => c.userId).sort(), ['u_a', 'u_b']);
  assert.deepEqual(R.leagueArchive({}, [m('a', 0)], '2026').champions, []);
  assert.deepEqual(R.leagueArchive({}, [], '2026').champions, []);
});

test('members restart at zero, ranked 1..n in a stable order, with no movement arrows from 2026', () => {
  const patches = R.memberResetPatches([{ id: 'z', totalPoints: 900, rank: 1 }, { id: 'a', totalPoints: 5, rank: 2 }]);
  assert.deepEqual(patches.map((p) => [p.id, p.patch.rank]), [['a', 1], ['z', 2]]);
  for (const { patch } of patches) {
    assert.deepEqual([patch.totalPoints, patch.moonshotPoints, patch.raceWins], [0, 0, 0]);
    for (const k of ['lastRacePoints', 'lastRaceId', 'previousRank', 'previousRankRaceId']) assert.equal(patch[k], R.DELETE, k);
  }
  assert.deepEqual(R.leagueResetPatch('2027'), { seasonId: '2027', raceResultIds: [] });
});

test('opening prices: points per race × rate, a floor, newcomers below five races, tiers from the price', () => {
  assert.deepEqual(R.openingPrice({ id: 'antonelli', scoredRaces: 20, scorePoints: 1205, currentPrice: 660 }), { id: 'antonelli', price: 603, tier: 'A', basis: '1205 pts / 20 races × $10', perRace: 60.3 });
  assert.equal(R.openingPrice({ id: 'hadjar', scoredRaces: 17, scorePoints: 639, currentPrice: 197 }).price, 376, 'per race scored, not per season race');
  assert.equal(R.openingPrice({ id: 'camara', scoredRaces: 1, scorePoints: -1, currentPrice: 115 }).price, R.NEWCOMER_PRICE);
  assert.equal(R.openingPrice({ id: 'x', scoredRaces: 4, scorePoints: 400, currentPrice: 1 }).price, R.NEWCOMER_PRICE);
  assert.equal(R.openingPrice({ id: 'x', scoredRaces: 5, scorePoints: -50, currentPrice: 1 }).price, R.MIN_PRICE, 'never below the floor');
  assert.equal(R.openingPrice({ id: 'mercedes', scoredRaces: 20, scorePoints: 2110, currentPrice: 700 }, { dollarsPerPoint: R.CONSTRUCTOR_DOLLARS_PER_POINT }).price, 528);
  assert.equal(R.CONSTRUCTOR_DOLLARS_PER_POINT, R.DOLLARS_PER_POINT / 2);
  assert.deepEqual([R.tierOf(241), R.tierOf(240), R.tierOf(121), R.tierOf(120)], ['A', 'B', 'B', 'C']);
  const patch = R.entityPricePatch({ fantasyPoints: 947, price: 660 }, { price: 603, tier: 'A' });
  assert.deepEqual(patch, { price: 603, previousPrice: 603, tier: 'A', seasonPoints: 947, fantasyPoints: 0 });
});

// A hand-built calendar in OpenF1's shape: testing, a sprint weekend, a normal weekend out of
// date order, a cancelled meeting.
const S = (meeting_key, session_name, iso, extra = {}) => ({ meeting_key, session_name, date_start: iso, date_end: iso, year: 2027, ...extra });
const meetings = [
  { meeting_key: 1, meeting_name: 'Pre-Season Testing', circuit_short_name: 'Sakhir', year: 2027 },
  { meeting_key: 3, meeting_name: 'Japanese Grand Prix', circuit_short_name: 'Suzuka', year: 2027 },
  { meeting_key: 2, meeting_name: 'Bahrain Grand Prix', circuit_short_name: 'Sakhir', year: 2027 },
  { meeting_key: 4, meeting_name: 'Cancelled Grand Prix', circuit_short_name: 'Jeddah', year: 2027, is_cancelled: true },
];
const sessions = [
  S(1, 'Day 1', '2027-02-24T07:00:00+00:00'),
  S(2, 'Practice 1', '2027-03-12T11:30:00+00:00'), S(2, 'Sprint Qualifying', '2027-03-12T15:30:00+00:00'),
  S(2, 'Sprint', '2027-03-13T11:00:00+00:00'), S(2, 'Qualifying', '2027-03-13T15:00:00+00:00'), S(2, 'Race', '2027-03-14T11:00:00+00:00'),
  S(3, 'Practice 1', '2027-04-09T02:30:00+00:00'), S(3, 'Practice 2', '2027-04-09T06:00:00+00:00'), S(3, 'Practice 3', '2027-04-10T02:30:00+00:00'),
  S(3, 'Qualifying', '2027-04-10T06:00:00+00:00'), S(3, 'Race', '2027-04-11T05:00:00+00:00'),
  S(4, 'Race', '2027-03-21T17:00:00+00:00'),
];

test('the calendar: one race per meeting with a Race, numbered by date, with our ids and circuit details', () => {
  const cal = buildCalendar(2027, meetings, sessions);
  assert.deepEqual(cal.map((r) => [r.round, r.id, r.name, r.hasSprint]), [[1, 'bahrain_2027', 'Bahrain Grand Prix', true], [2, 'japan_2027', 'Japanese Grand Prix', false]]);
  const [bah, jpn] = cal;
  assert.deepEqual(bah.schedule, { fp1: '2027-03-12T11:30:00.000Z', sprintQualifying: '2027-03-12T15:30:00.000Z', sprint: '2027-03-13T11:00:00.000Z', qualifying: '2027-03-13T15:00:00.000Z', race: '2027-03-14T11:00:00.000Z' });
  assert.deepEqual(Object.keys(jpn.schedule).sort(), ['fp1', 'fp2', 'fp3', 'qualifying', 'race']);
  assert.deepEqual([bah.seasonId, bah.status, bah.circuitId, bah.city, bah.timezone, bah.country], ['2027', 'upcoming', 'bahrain', 'Sakhir', 'Asia/Bahrain', 'Bahrain']);
  assert.ok(!('slug' in bah) && !('raceAt' in bah));
});

test('the calendar refuses rather than guesses: unknown circuit, another season, two meetings on one id', () => {
  assert.throws(() => buildCalendar(2027, [{ meeting_key: 9, meeting_name: 'New', circuit_short_name: 'Nowhere', year: 2027 }], [S(9, 'Race', '2027-05-01T12:00:00Z')]), /no CIRCUITS entry for "Nowhere"/);
  assert.throws(() => buildCalendar(2027, [{ ...meetings[1], year: 2026 }], sessions), /is from 2026, not 2027/);
  const twice = [meetings[1], { meeting_key: 5, meeting_name: 'Japan again', circuit_short_name: 'Suzuka', year: 2027 }];
  assert.throws(() => buildCalendar(2027, twice, [...sessions, S(5, 'Race', '2027-10-01T05:00:00Z')]), /map to japan_2027/);
});

test('every circuit keeps its 2026 race id slug, and slugs are unique', () => {
  const slugs = Object.values(CIRCUITS).map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'races2026.json'), 'utf8')).races;
  for (const r of fixture) assert.ok(slugs.includes(r.id.replace(/_2026$/, '')), `${r.id} has no 2027 slug`);
});
