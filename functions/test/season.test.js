// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-149: ingestion finds a race's OpenF1 meeting from the race document — its season and its race
// time — instead of one global year and a round → race id table. This replays the whole 2026
// calendar (the seeder's race documents against the sessions OpenF1 lists for 2026) and pins the
// cases that table got wrong or could not see: the 2026-10-01 Bahrain/Singapore misfiling, and a
// 2027 race document scored with the 2026 race that had the same round number.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MATCH_WINDOW_MS, DRIVER_TABLE_SEASON, toMs, seasonOfRace, meetingForRace, ingestBlocker, sessionsBySeason,
} = require('../lib/ingestion/season.js');
const { races } = require('../lib/seedData.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'openf1Sessions2026.json');
function sessions2026() {
  assert.ok(fs.existsSync(FIXTURE), `the OpenF1 2026 session fixture is missing (${FIXTURE}) — without it this test proves nothing`);
  const list = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).sessions;
  assert.ok(Array.isArray(list) && list.length > 100, 'the session fixture parsed but holds too few sessions');
  return list;
}
const DAY = 24 * 3600e3;
const raceMsOf = (r) => toMs(r.schedule.race);

// Where each 2026 race was actually run, by OpenF1's circuit name. Bahrain is the one at Sepang
// (round 18): matching by round number once put its times on Singapore.
const CIRCUIT = {
  australia_2026: 'Melbourne', china_2026: 'Shanghai', japan_2026: 'Suzuka', miami_2026: 'Miami',
  canada_2026: 'Montreal', monaco_2026: 'Monte Carlo', spain_2026: 'Catalunya', austria_2026: 'Spielberg',
  britain_2026: 'Silverstone', belgium_2026: 'Spa-Francorchamps', hungary_2026: 'Hungaroring',
  netherlands_2026: 'Zandvoort', italy_2026: 'Monza', madrid_2026: 'Madring', azerbaijan_2026: 'Baku',
  bahrain_2026: 'Kuala Lumpur', singapore_2026: 'Singapore', usa_2026: 'Austin', mexico_2026: 'Mexico City',
  brazil_2026: 'Interlagos', las_vegas_2026: 'Las Vegas', qatar_2026: 'Lusail', abu_dhabi_2026: 'Yas Marina Circuit',
};

test('every live 2026 race document finds its own meeting, by season and race time', () => {
  const all = sessions2026();
  const live = races.filter((r) => r.status !== 'cancelled');
  assert.equal(live.length, 23);
  assert.deepEqual(live.map((r) => r.id).sort(), Object.keys(CIRCUIT).sort());
  const seen = new Set();
  for (const r of live) {
    const season = seasonOfRace(r.id, r);
    assert.equal(season, 2026, r.id);
    const m = meetingForRace(all, season, raceMsOf(r));
    assert.ok(m, `${r.id}: no meeting`);
    assert.equal(m.race.circuit_short_name, CIRCUIT[r.id], r.id);
    assert.equal(m.race.session_name, 'Race');
    assert.ok(m.sessions.every((s) => s.meeting_key === m.meetingKey && s.year === 2026), r.id);
    assert.ok(!seen.has(m.meetingKey), `${r.id}: meeting ${m.meetingKey} matched twice`);
    seen.add(m.meetingKey);
  }
});

test('sprint weekends are exactly the meetings OpenF1 lists a Sprint for, and the documents flag the same ones', () => {
  const all = sessions2026();
  for (const r of races.filter((x) => x.status !== 'cancelled')) {
    const m = meetingForRace(all, 2026, raceMsOf(r));
    assert.equal(m.sessions.some((s) => s.session_name === 'Sprint'), r.hasSprint === true, r.id);
  }
});

test('the cancelled Jeddah weekend matches nothing, so its sessions never reach saudi_2026', () => {
  const saudi = races.find((r) => r.id === 'saudi_2026');
  assert.equal(saudi.status, 'cancelled');
  assert.equal(meetingForRace(sessions2026(), 2026, raceMsOf(saudi)), null);
});

test('a 2027 race document never matches a 2026 meeting', () => {
  const all = sessions2026();
  const aus = races.find((r) => r.id === 'australia_2026');
  // the 2026 round 1 race time, one year on: what a 2027 seed would carry for its own round 1
  const ms2027 = raceMsOf(aus) + 364 * DAY;
  const doc = { seasonId: '2027', round: 1, schedule: { race: new Date(ms2027) } };
  assert.equal(seasonOfRace('australia_2027', doc), 2027);
  assert.equal(meetingForRace(all, 2027, ms2027), null, 'no 2027 sessions → no meeting, not the 2026 one');
  // and even handed both years, only a 2027 meeting can match
  const next = all.filter((s) => s.meeting_key === 1279).map((s) => ({
    ...s, year: 2027, meeting_key: 9001, session_key: s.session_key + 100000,
    date_start: new Date(new Date(s.date_start).getTime() + 364 * DAY).toISOString(),
  }));
  const m = meetingForRace([...all, ...next], 2027, ms2027);
  assert.equal(m.meetingKey, 9001);
  assert.ok(m.sessions.every((s) => s.year === 2027));
});

test('a 2027 race is held for the car-number table, loudly; a 2026 race is not', () => {
  assert.equal(DRIVER_TABLE_SEASON, 2026);
  assert.equal(ingestBlocker('brazil_2026', 2026), null);
  assert.match(ingestBlocker('australia_2027', 2027), /car numbers are only known for 2026.*DRIVER_TABLE_SEASON = 2027/);
  assert.match(ingestBlocker('x_2026', null), /do not agree on one season/);
});

test('seasonOfRace refuses a document whose season, id and race time disagree', () => {
  const at = (iso) => ({ race: new Date(iso) });
  assert.equal(seasonOfRace('brazil_2026', { seasonId: '2026', schedule: at('2026-11-08T17:00Z') }), 2026);
  assert.equal(seasonOfRace('brazil_2026', { seasonId: 2026, schedule: at('2026-11-08T17:00Z') }), 2026);
  assert.equal(seasonOfRace('custom_race', { seasonId: ' 2027 ', schedule: null }), 2027);
  assert.equal(seasonOfRace('australia_2027', { seasonId: '2026', schedule: at('2027-03-07T04:00Z') }), null, 'id says 2027');
  assert.equal(seasonOfRace('australia_2027', { seasonId: '2027', schedule: at('2026-03-08T04:00Z') }), null, 'race time is 2026');
  for (const bad of [undefined, null, '', '26', 'season-2026', '2026a', 1999, 2101, 2026.5, {}]) {
    assert.equal(seasonOfRace('x', { seasonId: bad }), null, JSON.stringify(bad));
  }
});

test('the match window takes a session-time correction and refuses the next weekend', () => {
  const s = (key, iso, extra = {}) => ({ meeting_key: key, session_key: key * 10, session_name: 'Race', year: 2026, date_start: iso, date_end: iso, ...extra });
  const base = Date.parse('2026-11-22T04:00:00Z');
  const one = [s(1, '2026-11-22T04:00:00Z')];
  assert.equal(meetingForRace(one, 2026, base + MATCH_WINDOW_MS).meetingKey, 1);
  assert.equal(meetingForRace(one, 2026, base - MATCH_WINDOW_MS).meetingKey, 1);
  assert.equal(meetingForRace(one, 2026, base + MATCH_WINDOW_MS + 1), null);
  assert.equal(meetingForRace(one, 2026, NaN), null);
  assert.equal(meetingForRace(one, 2027, base), null, 'other season');
  assert.equal(meetingForRace([s(1, '2026-11-22T04:00:00Z', { is_cancelled: true })], 2026, base), null, 'cancelled');
  assert.equal(meetingForRace([{ ...one[0], session_name: 'Sprint' }], 2026, base), null, 'a Sprint is not the race');
  // two meetings both inside the window: refuse rather than guess
  assert.equal(meetingForRace([s(1, '2026-11-22T04:00:00Z'), s(2, '2026-11-24T04:00:00Z')], 2026, base + DAY), null);
});

test('toMs reads a Timestamp, Date, ISO string or millis, and nothing else', () => {
  const ms = Date.parse('2026-11-22T04:00:00Z');
  assert.equal(toMs({ toMillis: () => ms }), ms);
  assert.equal(toMs(new Date(ms)), ms);
  assert.equal(toMs('2026-11-22T04:00:00Z'), ms);
  assert.equal(toMs(ms), ms);
  for (const v of [null, undefined, {}, 'soon']) assert.ok(Number.isNaN(toMs(v)), String(v));
});

test('each season is fetched once per run', async () => {
  const calls = [];
  const get = sessionsBySeason(async (y) => { calls.push(y); return []; });
  await Promise.all([get(2026), get(2026), get(2027), get(2026)]);
  assert.deepEqual(calls, [2026, 2027]);
});

test('no ingestion source names a fixed season year, round table or sprint round list', () => {
  const dir = path.join(__dirname, '..', 'src');
  const files = ['ingestion/checkResults.ts', 'ingestion/syncSchedule.ts', 'ingestion/scheduleMonitor.ts', 'ingestion/config.ts', 'moonshot/liveSweep.ts'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const name of ['SEASON_YEAR', 'ROUND_TO_RACE_ID', 'SPRINT_ROUNDS', 'deriveRoundNumbers']) {
      assert.ok(!src.includes(name), `${f} uses ${name}`);
    }
  }
});
