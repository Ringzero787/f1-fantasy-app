// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-151: every server path that counts or orders races works on the current season. Before, a
// "completed race" was any completed race ever, so once the 2027 calendar exists a 2027 purchase
// would be stamped as race 22+, lockouts and contracts would run on that clock, a season lock would
// count both calendars, auto-fill would rank 2026's last rounds as the freshest form, and a
// re-approved 2026 race would score into teams that had started 2027.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp({ projectId: 'demo-f151' });
const { seasonFromRaces, currentSeason, isPastSeason, completedRaceCount, seasonRaces, refusePastSeason, seasonId } = require('../lib/season/current.js');
const { calculateDnfPenalty, DNF_PENALTY } = require('../lib/scoring/scoringCore.js');
const { loadFillContext } = require('../lib/teams/autoFill.js');

const at = (iso) => ({ toMillis: () => Date.parse(iso) });
const race = (seasonId, status, iso, extra = {}) => ({ seasonId, status, schedule: { race: at(iso) }, ...extra });

/** A stubbed Firestore that honours `==` and `in` filters on collection queries. */
function fakeDb(docs) {
  const store = new Map(Object.entries(docs));
  const snap = (k) => ({ id: k.split('/').pop(), exists: store.has(k), data: () => store.get(k) });
  const query = (name, filters) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]]),
    async get() {
      const out = [...store.keys()].filter((k) => k.startsWith(`${name}/`) && k.split('/').length === 2).map(snap)
        .filter((s) => filters.every(([f, op, v]) => (op === '==' ? s.data()[f] === v : op === 'in' ? v.includes(s.data()[f]) : (() => { throw new Error(op); })())));
      return { docs: out, size: out.length, empty: out.length === 0 };
    },
  });
  return { doc: (p) => ({ get: async () => snap(p) }), collection: (name) => query(name, []) };
}

// the calendar as it will stand after the rollover: all of 2026 run, 2027 seeded
const after = {
  'races/abu_dhabi_2026': race('2026', 'completed', '2026-12-06T13:00Z', { round: 25 }),
  'races/qatar_2026': race('2026', 'completed', '2026-11-29T16:00Z', { round: 24 }),
  'races/saudi_2026': race('2026', 'cancelled', '2026-04-19T17:00Z', { round: 5 }),
  'races/bahrain_2027': race('2027', 'completed', '2027-03-14T11:00Z', { round: 1 }),
  'races/saudi_2027': race('2027', 'upcoming', '2027-03-21T11:00Z', { round: 2 }),
  'races/australia_2027': race('2027', 'upcoming', '2027-04-04T04:00Z', { round: 3 }),
};

const T = (iso) => Date.parse(iso);

test('the season from the calendar: the most recent race that has started; no year in the code', () => {
  const now2026 = [race('2026', 'completed', '2026-11-08T17:00Z'), race('2026', 'upcoming', '2026-11-22T04:00Z')];
  assert.equal(seasonFromRaces(now2026, T('2026-11-15T00:00Z')), '2026');
  // after Abu Dhabi, before the 2027 calendar
  assert.equal(seasonFromRaces([race('2026', 'completed', '2026-12-06T13:00Z'), race('2026', 'cancelled', '2026-04-19T17:00Z')], T('2026-12-08T00:00Z')), '2026');
  // the rollover window: 2027 seeded, the switch not yet made — still 2026 until the opener starts,
  // so a late correction to Abu Dhabi is not refused as a past season
  const seeded = [race('2026', 'completed', '2026-12-06T13:00Z'), race('2027', 'upcoming', '2027-03-14T11:00Z'), race('2027', 'upcoming', '2027-03-21T11:00Z')];
  assert.equal(seasonFromRaces(seeded, T('2026-12-08T00:00Z')), '2026');
  assert.equal(seasonFromRaces(seeded, T('2027-03-14T11:00Z')), '2027', 'the opener has started');
  assert.equal(seasonFromRaces(Object.values(after), T('2027-03-20T00:00Z')), '2027');
  // a cancelled race never decides, and nothing started yet → the earliest to come
  assert.equal(seasonFromRaces([race('2027', 'cancelled', '2026-11-01T00:00Z'), race('2026', 'upcoming', '2026-11-22T04:00Z')], T('2026-11-15T00:00Z')), '2026');
  assert.equal(seasonFromRaces([], T('2026-11-15T00:00Z')), null);
  assert.equal(seasonFromRaces([{ seasonId: 2027, status: 'upcoming', schedule: { race: at('2027-03-14T11:00Z') } }], T('2027-04-01T00:00Z')), '2027', 'a numeric season id is the same year');
  assert.deepEqual([seasonId('2026'), seasonId(2026), seasonId('26'), seasonId(2026.5), seasonId(null)], ['2026', '2026', null, null, null]);
});

test('config/app.currentSeason wins; without it the calendar decides', async () => {
  assert.equal(await currentSeason(fakeDb({ 'config/app': { currentSeason: '2027' }, ...after })), '2027');
  assert.equal(await currentSeason(fakeDb({ 'config/app': { currentSeason: 'next' }, 'races/x_2026': race('2026', 'upcoming', '2026-11-22T04:00Z') }), T('2026-11-15T00:00Z')), '2026', 'a malformed value is ignored');
  assert.equal(await currentSeason(fakeDb({ 'races/x_2026': race('2026', 'upcoming', '2026-11-22T04:00Z') }), T('2026-11-15T00:00Z')), '2026');
});

test('the scorers refuse a past-season race, and only that', async () => {
  const pinned = fakeDb({ 'config/app': { currentSeason: '2027' } });
  assert.equal(await refusePastSeason(pinned, 'abu_dhabi_2026', '2026', 't'), true);
  assert.equal(await refusePastSeason(pinned, 'abu_dhabi_2026', 2026, 't'), true, 'a numeric id is judged the same');
  assert.equal(await refusePastSeason(pinned, 'bahrain_2027', '2027', 't'), false);
  assert.equal(await refusePastSeason(pinned, 'x', undefined, 't'), false, 'no season on the race: scores, as before');
  // today, no config: Las Vegas 2026 scores
  const today = fakeDb({ 'races/brazil_2026': race('2026', 'completed', '2026-11-08T17:00Z'), 'races/las_vegas_2026': race('2026', 'upcoming', '2026-11-22T04:00Z') });
  assert.equal(await refusePastSeason(today, 'las_vegas_2026', '2026', 't'), false);
});

test('DNF: the flat -5 is only for 2026 before round 17; 2027 is proportional from round 1', () => {
  // 2026 replays exactly as scored
  assert.equal(calculateDnfPenalty(1, 53, 16, '2026'), DNF_PENALTY);
  assert.equal(calculateDnfPenalty(1, 53, 16), DNF_PENALTY, 'no season: judged as 2026');
  assert.equal(calculateDnfPenalty(0, 57, 17, '2026'), -8);
  // 2027: rounds restart, the rule does not
  assert.equal(calculateDnfPenalty(0, 57, 1, '2027'), -8);
  assert.equal(calculateDnfPenalty(57, 57, 3, 2027), -2);
  assert.equal(calculateDnfPenalty(1, 53, 30, '2025'), DNF_PENALTY, 'an earlier season is never proportional');
  assert.equal(calculateDnfPenalty(undefined, 57, 3, '2027'), DNF_PENALTY, 'missing lap data still falls back');
});

test('only an earlier season is past: the current and later seasons score, and nothing is refused without a season', () => {
  assert.equal(isPastSeason('2026', '2027'), true);
  assert.equal(isPastSeason('2027', '2027'), false);
  assert.equal(isPastSeason('2028', '2027'), false);
  assert.equal(isPastSeason('2026', null), false);
  assert.equal(isPastSeason(undefined, '2027'), false);
  assert.equal(isPastSeason(2026, '2027'), true, 'a numeric season id is the same year');
  assert.equal(isPastSeason('26', '2027'), false, 'only a well-formed season id is judged');
});

test('the completed-race clock counts this season only', async () => {
  const db = fakeDb({ 'config/app': { currentSeason: '2027' }, ...after });
  assert.equal(await completedRaceCount(db), 1, 'bahrain_2027 only — not 2026\'s completed races');
  assert.deepEqual((await seasonRaces(db, '2027', 'completed')).docs.map((d) => d.id), ['bahrain_2027']);
  assert.equal((await seasonRaces(db, null, 'completed')).size, 3, 'no season readable: all, as before');
});

test('auto-fill form: the most recent races by date, across the season boundary', async () => {
  const db = fakeDb({
    ...after,
    'drivers/a': { isActive: true, price: 100 }, 'constructors/c': { isActive: true, price: 100 },
  });
  let asked;
  const realCollection = db.collection;
  db.collection = (name) => {
    if (name !== 'raceScores') return realCollection(name);
    return { where: (_f, _op, ids) => ({ get: async () => { asked = ids; return { docs: [] }; } }) };
  };
  await loadFillContext(db);
  // by round, Abu Dhabi (25) and Qatar (24) would come before Bahrain 2027 (round 1)
  assert.equal(asked[0], 'bahrain_2027');
  assert.deepEqual(asked.slice(0, 3), ['bahrain_2027', 'abu_dhabi_2026', 'qatar_2026']);
});

test('every race-counting server path goes through the current season', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const ops = src('teams/teamOperations.ts');
  assert.match(ops, /return completedRaceCount\(db\);/);
  const cp = src('scoring/calculatePoints.ts');
  assert.match(cp, /const completedRaceCountNow = await completedRaceCount\(db\);/, 'contract expiry on the same clock as purchases');
  assert.ok(!/collection\('races'\)\s*\.where\('status', '==', 'completed'\)\s*\.get\(\)/.test(cp.replace(/\r/g, '')), 'no all-time completed-race query left in the scorer');
  for (const tag of ['Scoring', 'Qualifying', 'Sprint']) assert.ok(cp.includes(`refusePastSeason(db, raceId,`) && cp.includes(`, '${tag}')) return null;`), `${tag} scoring guards the season`);
  assert.equal((cp.match(/seasonId: (afterData|race)\.seasonId,\r?\n/g) || []).length, 2, 'team scoring and repair pass the season to the DNF rule');
  assert.match(cp, /calculateDnfPenalty\(result\.laps, afterData\.totalLaps, afterData\.round, afterData\.seasonId\)/, 'the race-score breakdown too');
  assert.equal((cp.match(/seasonId: afterData\.seasonId \?\? null,/g) || []).length, 2, 'driver and constructor race scores carry the season');
  assert.match(src('locks/teamLocks.ts'), /seasonId\(data\.seasonId\) === season/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'pitwallPass.js'), 'utf8'), /opt\('season'\) \|\| saleSeason\(Date\.now\(\)\)/);
});
