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
  assert.deepEqual([a.totalPoints, a.lockedPoints, a.moonshotPoints], [900, 3600, 79]);
  for (const k of ['raceWins', 'racesPlayed', 'pointsHistory']) assert.ok(!(k in a), `${k} is client-written: not part of the record`);
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
  assert.ok(!('raceResultIds' in a), 'owner-writable, not copied');
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
  assert.deepEqual(R.openingPrice({ id: 'antonelli', scoredRaces: 20, scorePoints: 1205, currentPrice: 660 }), { id: 'antonelli', price: 362, tier: 'A', basis: '1205 pts / 20 races × $6', perRace: 60.3 });
  assert.equal(R.DOLLARS_PER_POINT, 6, 'owner 2026-11-15: 2027 opens at the 2026 level');
  assert.equal(R.openingPrice({ id: 'hadjar', scoredRaces: 17, scorePoints: 639, currentPrice: 197 }).price, 226, 'per race scored, not per season race');
  assert.equal(R.openingPrice({ id: 'camara', scoredRaces: 1, scorePoints: -1, currentPrice: 115 }).price, R.NEWCOMER_PRICE);
  assert.equal(R.openingPrice({ id: 'x', scoredRaces: 4, scorePoints: 400, currentPrice: 1 }).price, R.NEWCOMER_PRICE);
  assert.equal(R.openingPrice({ id: 'x', scoredRaces: 5, scorePoints: -50, currentPrice: 1 }).price, R.MIN_PRICE, 'never below the floor');
  assert.equal(R.openingPrice({ id: 'mercedes', scoredRaces: 20, scorePoints: 2110, currentPrice: 700 }, { dollarsPerPoint: R.CONSTRUCTOR_DOLLARS_PER_POINT }).price, 317);
  assert.equal(R.CONSTRUCTOR_DOLLARS_PER_POINT, R.DOLLARS_PER_POINT / 2);
  assert.deepEqual([R.tierOf(241), R.tierOf(240), R.tierOf(121), R.tierOf(120)], ['A', 'B', 'B', 'C']);
  const patch = R.entityPricePatch({ fantasyPoints: 947, price: 660 }, { price: 603, tier: 'A' });
  assert.deepEqual(patch, { price: 603, previousPrice: 603, tier: 'A', seasonPoints: 947, fantasyPoints: 0 });
});

test('F-155: the median — odd count the middle value, even count the rounded mean of the middle two, none is null', () => {
  assert.equal(R.median([300, 5, 150]), 150);
  assert.equal(R.median([100, 151, 10, 400]), 126);
  assert.equal(R.median([]), null);
  assert.equal(R.median([NaN, 7]), 7);
  assert.equal(R.newcomerPrice([{ price: 10 }, { price: 900, inactive: true }, { price: 30 }, { price: 20 }]), 20, 'a retired driver is not in the market median');
  assert.equal(R.newcomerPrice([{ price: 9, inactive: true }]), null);
});

// The production drivers on 2026-11-24 (21 of 23 races scored): race count and points from raceScores, today's price.
const DRIVERS_2026_11_24 = [
  ['antonelli', 21, 1255, 664], ['verstappen', 21, 1038, 655], ['norris', 21, 936, 611], ['hamilton', 21, 1049, 588], ['leclerc', 21, 938, 570],
  ['piastri', 21, 801, 553], ['russell', 21, 931, 526], ['lawson', 21, 698, 353], ['gasly', 21, 579, 254], ['colapinto', 21, 495, 246],
  ['bortoleto', 21, 438, 244], ['sainz', 21, 349, 217], ['hadjar', 18, 647, 204], ['lindblad', 21, 524, 193], ['bearman', 21, 326, 184],
  ['hulkenberg', 21, 421, 173], ['albon', 21, 177, 128], ['perez', 21, 206, 60], ['alonso', 21, 197, 56], ['bottas', 21, 62, 17], ['stroll', 21, 54, 17],
];

test('F-155: newcomers open at the median driver — on 2026\'s data, Câmara (2 races) and a driver with no 2026 races at $150, not $5', () => {
  const entities = [
    ...DRIVERS_2026_11_24.map(([id, , , price]) => ({ coll: 'drivers', id, data: { price, fantasyPoints: 1 } })),
    // retired mid-season: priced, but not in the market median
    { coll: 'drivers', id: 'ocon', data: { price: 256, fantasyPoints: 249, isActive: false } },
    { coll: 'drivers', id: 'camara', data: { price: 127, fantasyPoints: 11 } },
    { coll: 'drivers', id: 'rookie', data: { price: 120, fantasyPoints: 0 } },
    { coll: 'constructors', id: 'mclaren', data: { price: 662, fantasyPoints: 1172 } },
  ];
  const scores = Object.fromEntries(DRIVERS_2026_11_24.map(([id, races, points]) => [id, { races, points }]));
  Object.assign(scores, { ocon: { races: 18, points: 361 }, camara: { races: 2, points: 12 }, mclaren: { races: 20, points: 1628 } });
  const plan = R.planRollover(input({ entities, scores }));
  const price = (id) => plan.prices.find((p) => p.id === id).out;
  assert.equal(plan.newcomer.drivers, 150, 'the 11th of 21 active drivers by 2027 opening price (Lindblad 524/21 × $6)');
  assert.equal(price('lindblad').price, 150);
  for (const id of ['camara', 'rookie']) {
    assert.equal(price(id).price, 150, id);
    assert.equal(price(id).tier, 'B');
    assert.match(price(id).basis, /newcomer price/);
  }
  assert.equal(price('ocon').price, 120, 'a retired driver is still re-priced from his own races');
  assert.equal(plan.newcomer.constructors, 244, 'the only constructor priced from results');
  const season = plan.groups.at(-1).ops.find((o) => o.path === 'seasons/2027');
  assert.equal(season.data.newcomerPrice, 150, 'F-156 prices a driver new in 2027 from here');
  // a re-run with everything already priced still states the same newcomer price
  const stamped = entities.map((e) => ({ ...e, data: { ...e.data, pricedFor: '2027' } }));
  assert.equal(R.planRollover(input({ entities: stamped, scores })).newcomer.drivers, 150);
});

test('F-155: with no driver priced from results the newcomer price falls back to the old $5', () => {
  const plan = R.planRollover(input({ entities: [{ coll: 'drivers', id: 'x', data: { price: 50 } }], scores: {} }));
  assert.equal(plan.newcomer.drivers, null);
  assert.equal(plan.prices[0].out.price, R.NEWCOMER_PRICE);
  assert.equal(plan.groups.at(-1).ops[0].data.newcomerPrice, R.NEWCOMER_PRICE);
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

// ── the plan the script commits ─────────────────────────────────────────────────────────────────
const cal = buildCalendar(2027, meetings, sessions);
const input = (over = {}) => ({
  from: '2026', to: '2027',
  teams: [{ id: 't1', data: team2026(), archived: false }, { id: 't2', data: { ...team2026(), name: 'Other' }, archived: true }],
  leagues: [{ id: 'L1', data: { name: 'L', seasonId: '2026', raceResultIds: ['r1'] }, archived: false, members: [{ id: 'm1', userId: 'u1', displayName: 'Ann', totalPoints: 900 }, { id: 'm2', userId: 'u2', displayName: 'Bo', totalPoints: 100 }] }],
  entities: [
    { coll: 'drivers', id: 'norris', data: { price: 592, fantasyPoints: 695 } },
    { coll: 'drivers', id: 'piastri', data: { price: 370, fantasyPoints: 0, seasonPoints: 561, pricedFor: '2027' } },
    { coll: 'constructors', id: 'mclaren', data: { price: 662, fantasyPoints: 1172 } },
  ],
  scores: { norris: { races: 20, points: 872 }, piastri: { races: 20, points: 740 }, mclaren: { races: 20, points: 1628 } },
  calendar: cal, existingRaces: ['japan_2027'],
  ...over,
});

test('plan: each team is one atomic group — archive created with the reset — and an archived team is done', () => {
  const plan = R.planRollover(input());
  const t1 = plan.groups.find((g) => g.label === 'team t1');
  assert.deepEqual(t1.ops.map((o) => [o.kind, o.path]), [['create', 'fantasyTeams/t1/seasons/2026'], ['update', 'fantasyTeams/t1'], ['replace', 'fantasyTeams/t1']]);
  assert.equal(t1.ops[0].data.archivedAt, R.NOW);
  assert.deepEqual(t1.ops[1].data, { updatedAt: R.NOW }, 'the existence check carries nothing else');
  assert.equal(t1.ops[2].data.budget, 1000);
  assert.ok('constructor' in t1.ops[2].data);
  assert.ok(!plan.groups.some((g) => g.label === 'team t2'), 'archived on an earlier run');
  assert.deepEqual([plan.teams.total, plan.teams.reset], [2, 1]);
});

test('plan: a team or league a player stamped seasonId 2027 is still archived and reset', () => {
  const plan = R.planRollover(input({
    teams: [{ id: 'cheat', data: { ...team2026(), seasonId: '2027' }, archived: false }],
    leagues: [{ id: 'Lc', data: { name: 'x', seasonId: '2027' }, archived: false, members: [{ id: 'm', userId: 'u', totalPoints: 5 }] }],
  }));
  const team = plan.groups.find((g) => g.label === 'team cheat');
  assert.ok(team, 'the client-writable seasonId is not a skip marker');
  assert.equal(team.ops[2].data.totalPoints, 0);
  assert.ok(plan.groups.find((g) => g.label === 'league Lc'));
});

test('plan: a league commits its archive, every member and its reset together; an archived league is done', () => {
  const plan = R.planRollover(input());
  const g = plan.groups.find((x) => x.label === 'league L1');
  assert.deepEqual(g.ops.map((o) => o.path), ['leagues/L1/seasons/2026', 'leagues/L1/members/m1', 'leagues/L1/members/m2', 'leagues/L1']);
  assert.deepEqual(g.ops[0].data.champions, [{ userId: 'u1', displayName: 'Ann' }]);
  assert.deepEqual(g.ops[0].data.memberUserIds, ['u1', 'u2']);
  assert.deepEqual(g.ops[3].data.raceResultIds, []);
  const again = R.planRollover(input({ leagues: [{ ...input().leagues[0], archived: true, members: [{ id: 'm1', totalPoints: 0 }] }] }));
  assert.ok(!again.groups.some((x) => x.label === 'league L1'), 'a re-run never rebuilds the archive from zeroed members');
});

test('plan: prices in one group, a priced entity is not re-priced, and finals cover every entity', () => {
  const plan = R.planRollover(input());
  const g = plan.groups.find((x) => x.label === 'prices');
  assert.deepEqual(g.ops.map((o) => o.path), ['drivers/norris', 'constructors/mclaren']);
  assert.equal(g.ops[1].data.price, Math.round(1628 / 20 * 3), 'constructors at the constructor rate');
  assert.equal(g.ops[0].data.pricedFor, '2027');
  assert.deepEqual(plan.finals, { drivers: { norris: { fantasyPoints: 695 }, piastri: { fantasyPoints: 561 } }, constructors: { mclaren: { fantasyPoints: 1172 } } });
});

test('plan: only missing races are created, the season switch is last, and the backup list covers what is created', () => {
  const plan = R.planRollover(input());
  const c = plan.groups.find((x) => x.label === 'calendar');
  assert.deepEqual(c.ops.map((o) => [o.kind, o.path]), [['create', 'races/bahrain_2027']]);
  assert.deepEqual(plan.groups[0], { label: 'pin season', ops: [{ kind: 'merge', path: 'config/app', data: { currentSeason: '2026' } }] }, 'the season is pinned before 2027 races exist');
  assert.ok(plan.groups.findIndex((g) => g.label === 'calendar') > 0);
  const last = plan.groups[plan.groups.length - 1];
  assert.equal(last.label, 'season switch');
  assert.deepEqual(last.ops.map((o) => o.path), ['seasons/2027', 'seasons/2026', 'config/app']);
  assert.deepEqual(last.ops[2].data, { currentSeason: '2027' });
  assert.equal(last.ops[1].data.isActive, false);
  for (const p of ['fantasyTeams/t1/seasons/2026', 'leagues/L1/seasons/2026', 'leagues/L1/members', 'races/bahrain_2027', 'races/japan_2027', 'seasons/2027', 'config/app']) assert.ok(plan.backupPaths.includes(p), p);
});

test('account deletion: an archived league table keeps the row but loses who it was', () => {
  const archive = R.leagueArchive({ name: 'L' }, [{ id: 'm1', userId: 'u1', displayName: 'Ann', totalPoints: 900 }, { id: 'm2', userId: 'u2', displayName: 'Bo', totalPoints: 100 }], '2026');
  const patch = R.anonymiseLeagueArchive(archive, 'u1');
  assert.deepEqual(patch.standings.map((s) => [s.rank, s.totalPoints, s.userId, s.displayName]), [[1, 900, null, R.DELETED_PLAYER], [2, 100, 'u2', 'Bo']]);
  assert.deepEqual(patch.champions, [{ userId: null, displayName: R.DELETED_PLAYER }]);
  assert.deepEqual(patch.memberUserIds, ['u2']);
  assert.equal(R.anonymiseLeagueArchive(archive, 'nobody'), null);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'users', 'deleteUserData.ts'), 'utf8');
  assert.match(src, /db\.recursiveDelete\(t\.ref\)/, 'teams go with their subcollections');
  assert.match(src, /collectionGroup\('seasons'\)\.where\('memberUserIds', 'array-contains', userId\)/);
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.indexes.json'), 'utf8'));
  assert.ok(idx.fieldOverrides.some((f) => f.collectionGroup === 'seasons' && f.fieldPath === 'memberUserIds' && f.indexes.some((i) => i.arrayConfig === 'CONTAINS' && i.queryScope === 'COLLECTION_GROUP')));
});

test('the calendar refuses a Race with no start time and a name that is not a race name', () => {
  assert.throws(() => buildCalendar(2027, [meetings[1]], [S(3, 'Race', 'soon')]), /has no start time/);
  assert.throws(() => buildCalendar(2027, [{ ...meetings[1], meeting_name: '<script>x</script>' }], sessions), /implausible name/);
  assert.equal(buildCalendar(2027, [{ ...meetings[1], meeting_name: 'São Paulo Grand Prix' }], sessions)[0].name, 'São Paulo Grand Prix');
});

// ── F-154: hardening before the production run ──────────────────────────────────────────────────

test('F-154: prices are written before any team or league is reset', () => {
  const plan = R.planRollover(input());
  const labels = plan.groups.map((g) => g.label);
  const prices = labels.indexOf('prices');
  assert.equal(labels[0], 'pin season');
  assert.equal(prices, 1, `prices must be the first write after the pin, got ${labels.join(' → ')}`);
  const firstReset = labels.findIndex((l) => l.startsWith('team ') || l.startsWith('league '));
  assert.ok(firstReset > prices, 'no team or league is reset while 2026 prices are still on the market');
  assert.equal(labels[labels.length - 1], 'season switch');
});

test('F-154: a re-run with every price stamped still resets the remaining teams (no prices group, order kept)', () => {
  const entities = input().entities.map((e) => ({ ...e, data: { ...e.data, pricedFor: '2027', seasonPoints: e.data.fantasyPoints } }));
  const labels = R.planRollover(input({ entities })).groups.map((g) => g.label);
  assert.ok(!labels.includes('prices'));
  assert.deepEqual(labels.slice(0, 2), ['pin season', 'team t1']);
});

const H = 3600e3;
const NOW_MS = Date.parse('2026-12-08T12:00:00Z');
const ready = (over = {}) => ({
  from: '2026', to: '2027', now: NOW_MS, settleHours: 24,
  fromSeason: {}, currentSeason: '2026',
  fromRaces: [
    { id: 'brazil_2026', status: 'completed', raceTimeMs: NOW_MS - 20 * 24 * H },
    { id: 'abu_dhabi_2026', status: 'completed', raceTimeMs: NOW_MS - 48 * H },
    { id: 'imola_2026', status: 'cancelled', raceTimeMs: NaN },
  ],
  pendingResultIds: [], scoredRaceIds: ['brazil_2026', 'abu_dhabi_2026'],
  moonshots: [
    { id: 'a', status: 'HIT', settledAt: 'T', raceId: 'brazil_2026' },
    { id: 'b', status: 'VOID', settledAt: 'T', raceId: 'abu_dhabi_2026' },
    { id: 'c', status: 'CANCELLED', settledAt: null, raceId: 'abu_dhabi_2026' },
  ],
  calendarSize: 24,
  noticeSentMs: NOW_MS - 72 * H,
  noticeEmailMs: NOW_MS - 48 * H,
  ...over,
});

test('F-154: a finished, scored, settled season has no blockers', () => {
  assert.deepEqual(R.rolloverBlockers(ready()), []);
});

test('F-154: a completed race with no raceScores rows blocks (prices would treat it as missed by everyone)', () => {
  const b = R.rolloverBlockers(ready({ scoredRaceIds: ['brazil_2026'] }));
  assert.equal(b.length, 1);
  assert.match(b[0], /no raceScores rows: abu_dhabi_2026/);
  // a cancelled race needs no rows
  assert.ok(!b[0].includes('imola_2026'));
});

test('F-154: a Moonshot call still open blocks; settled, void and cancelled calls do not', () => {
  for (const status of ['CONFIRMED', 'LOCKED', 'LIVE']) {
    const b = R.rolloverBlockers(ready({ moonshots: [...ready().moonshots, { id: 'open1', status, settledAt: null, raceId: 'abu_dhabi_2026' }] }));
    assert.equal(b.length, 1, status);
    assert.match(b[0], /1 2026 Moonshot call\(s\) not settled or cancelled: open1/);
  }
  // an unknown status with no settledAt is not taken as finished
  assert.equal(R.rolloverBlockers(ready({ moonshots: [{ id: 'x', status: 'WEIRD', raceId: 'abu_dhabi_2026' }] })).length, 1);
  assert.equal(R.moonshotFinished({ status: 'MISSED', settledAt: 'T' }), true);
  assert.equal(R.moonshotFinished({ status: 'LOCKED', settledAt: null }), false);
});

test('F-154: the preconditions the script already had still hold, now in one tested place', () => {
  const one = (over) => R.rolloverBlockers(ready(over));
  assert.match(one({ fromSeason: { rolledOverAt: 'T' } })[0], /already rolled over/);
  assert.match(one({ currentSeason: '2025' })[0], /currentSeason is "2025"/);
  assert.equal(one({ currentSeason: '2027' }).length, 0, 'a re-run after the switch is not blocked by its own switch');
  assert.match(one({ fromRaces: [] }).join(' '), /no completed 2026 race found/);
  assert.match(one({ fromRaces: [...ready().fromRaces, { id: 'qatar_2026', status: 'upcoming', raceTimeMs: NOW_MS + H }] })[0], /1 2026 race\(s\) not completed: qatar_2026 \(upcoming\)/);
  assert.match(one({ now: NOW_MS - 30 * H })[0], /wait 24 h for corrections/);
  assert.match(one({ pendingResultIds: ['abu_dhabi_2026', 'x_2025'] })[0], /held for review: abu_dhabi_2026$/);
  assert.match(one({ calendarSize: 0 })[0], /OpenF1 lists no 2027 races/);
});

test('F-154: backup coverage — a collection root covers its own documents, never their subcollections', () => {
  assert.equal(R.coveredBy('fantasyTeams/t1', 'fantasyTeams'), true);
  assert.equal(R.coveredBy('fantasyTeams/t1/seasons/2026', 'fantasyTeams'), false);
  assert.equal(R.coveredBy('leagues/L1/members/m1', 'leagues/L1/members'), true);
  assert.equal(R.coveredBy('config/app', 'config/app'), true);
  assert.equal(R.coveredBy('config/appX', 'config/app'), false);
  assert.equal(R.coveredBy('config/app/x/y', 'config/app'), false, 'a document root covers only itself');
});

test('F-154: every write of the plan is covered by the plan\'s own backup list; a team created since is not', () => {
  const plan = R.planRollover(input());
  const writes = plan.groups.flatMap((g) => g.ops.map((o) => o.path));
  assert.deepEqual(R.uncoveredPaths(writes, plan.backupPaths), []);
  const later = R.planRollover(input({ teams: [...input().teams, { id: 'tNew', data: team2026(), archived: false }] }));
  const laterWrites = later.groups.flatMap((g) => g.ops.map((o) => o.path));
  assert.deepEqual(R.uncoveredPaths(laterWrites, plan.backupPaths), ['fantasyTeams/tNew/seasons/2026']);
});

// ── the script's switch between production and a rehearsal in the emulator ────────────────────
const { connectionFor, EXPECTED_PROJECT } = require('../lib/season/rolloverConnection.js');

test('F-154: the script and the switch agree on the production project', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seasonRollover.js'), 'utf8');
  assert.match(src, /const EXPECTED_PROJECT = 'f1-app-18077';/);
  assert.match(src, /lib\('rolloverConnection\.js'\)\.connectionFor\(process\.argv\.slice\(2\), process\.env\)/);
});

test('F-154: production runs load the key, refuse a stray emulator variable, and need no flag to dry-run', () => {
  assert.equal(EXPECTED_PROJECT, 'f1-app-18077');
  assert.deepEqual(connectionFor([], {}), { apply: false, failAfter: null, pathsOut: null, pathsCheck: null, emulator: null, useKey: true });
  const a = connectionFor(['--apply', '--paths-check=/x/p.txt'], {});
  assert.equal(a.useKey, true); assert.equal(a.apply, true); assert.equal(a.pathsCheck, '/x/p.txt');
  assert.match(connectionFor(['--apply'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).error, /FIRESTORE_EMULATOR_HOST is set/);
  assert.match(connectionFor([], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).error, /without --emulator/);
});

test('F-154: the emulator switch only takes a loopback address and never loads the key', () => {
  const e = connectionFor(['--emulator=127.0.0.1:8791', '--apply'], {});
  assert.equal(e.useKey, false); assert.equal(e.emulator, '127.0.0.1:8791'); assert.equal(e.apply, true);
  assert.equal(connectionFor(['--emulator=localhost:8080'], {}).useKey, false);
  for (const bad of ['--emulator=firestore.googleapis.com:443', '--emulator=10.0.25.1:8080', '--emulator=127.0.0.1', '--emulator=127.0.0.1:80/x', '--emulator=127.0.0.1.evil.com:8080', '--emulator']) {
    assert.ok(connectionFor([bad], {}).error, bad);
  }
});

test('F-154: rehearsal-only and malformed flags are refused before anything connects', () => {
  assert.match(connectionFor(['--fail-after=3'], {}).error, /needs --emulator/);
  assert.equal(connectionFor(['--emulator=127.0.0.1:8791', '--apply', '--fail-after=3'], {}).failAfter, 3);
  assert.match(connectionFor(['--emulator=127.0.0.1:8791', '--fail-after=x'], {}).error, /whole number/);
  assert.match(connectionFor(['--apply', '--paths-out=/x'], {}).error, /belongs to the dry run/);
  assert.match(connectionFor(['--write'], {}).error, /not a flag/);
  assert.match(connectionFor(['--apply=yes'], {}).error, /takes no value/);
  assert.match(connectionFor(['--apply', '--apply'], {}).error, /twice/);
  assert.match(connectionFor(['--paths-check='], {}).error, /needs a value/);
});

// The SDK only asserts when the batch is committed, so this is checked on the plan; the emulator
// rehearsal (F-150 spec, "Rehearsal") is where the commit itself was seen to fail and then pass.
test('F-154: no update() in the plan writes a top-level `constructor` (the SDK cannot; see Op in rollover.ts)', () => {
  const plan = R.planRollover(input());
  const bad = plan.groups.flatMap((g) => g.ops).filter((o) => o.kind === 'update' && Object.prototype.hasOwnProperty.call(o.data, 'constructor'));
  assert.deepEqual(bad.map((o) => o.path), []);
});


test('F-154: how each write is sent — the team reset replaces its named fields, guarded by an update of the same team', () => {
  const plan = R.planRollover(input());
  const t1 = plan.groups.find((g) => g.label === 'team t1');
  const [archive, guard, reset] = t1.ops;
  assert.deepEqual(R.writeCall(archive), { method: 'create' });
  // update() fails the batch when the team is gone, so the set below can never recreate a deleted team
  assert.deepEqual(R.writeCall(guard), { method: 'update' });
  assert.equal(guard.path, reset.path);
  const call = R.writeCall(reset);
  assert.equal(call.method, 'set');
  assert.deepEqual(call.options, { mergeFields: Object.keys(reset.data) }, 'mergeFields, never merge: true (a deep merge would keep 2026 keys inside lockStatus)');
  assert.ok(call.options.mergeFields.includes('constructor'));
  // every field the reset deletes is in the mask, which is what lets FieldValue.delete() through
  for (const [k, v] of Object.entries(reset.data)) if (v === R.DELETE) assert.ok(call.options.mergeFields.includes(k), k);
  assert.deepEqual(R.writeCall({ kind: 'merge', path: 'config/app', data: {} }), { method: 'set', options: { merge: true } });
  assert.throws(() => R.writeCall({ kind: 'upsert', path: 'x/y', data: {} }), /unknown write kind/);
  // every replace in the plan sits after an update of the same document in the same group
  for (const g of plan.groups) g.ops.forEach((o, i) => { if (o.kind === 'replace') assert.ok(g.ops.slice(0, i).some((p) => p.kind === 'update' && p.path === o.path), `${g.label}: unguarded replace`); });
});

test('F-155: the reset email needs the same lead time as the inbox notice', () => {
  const recent = R.rolloverBlockers(ready({ noticeEmailMs: NOW_MS - 2 * H }));
  assert.ok(recent.some((b) => /reset email was stamped 2\.0 h ago/.test(b)), recent.join(' | '));
  assert.ok(!R.rolloverBlockers(ready({ noticeEmailMs: NOW_MS - 25 * H })).some((b) => /reset email/.test(b)));
});
