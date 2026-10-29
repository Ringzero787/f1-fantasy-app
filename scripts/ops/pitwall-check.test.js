// node --test scripts/ops/*.test.js — the Pit Wall check's rules (F-132): a hung worker, a stale
// or wrong-round payload, an unscored race, and a calendar that moved, vanished or grew.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, pairRounds, sessionDrift, currentRound } = require('./pitwall-check-lib');

const NOW = new Date('2026-10-29T12:00:00Z');
const min = (n) => n * 60 * 1000;
const race = (id, round, status, raceAt, extra = {}) => ({ id, round, status, schedule: { qualifying: new Date(new Date(raceAt).getTime() - 23 * 3600 * 1000).toISOString(), race: raceAt, ...extra.schedule } });
const meeting = (key, name, raceAt, sessions = []) => ({ meeting_key: key, meeting_name: name, date_start: new Date(new Date(raceAt).getTime() - 2 * 24 * 3600 * 1000).toISOString(), raceStart: raceAt, sessions: [{ session_name: 'Race', date_start: raceAt }, ...sessions] });

const healthy = () => ({
  worker: { lastTickAt: NOW.getTime() - min(3), round: 21, lastRun: { jobId: 'x', ok: true } },
  races: [race('usa_2026', 20, 'completed', '2026-10-25T20:00:00.000Z'), race('mexico_2026', 21, 'upcoming', '2026-11-01T20:00:00.000Z'), race('brazil_2026', 22, 'upcoming', '2026-11-08T17:00:00.000Z')],
  newestPublic: { round: { number: 21, name: 'Mexico City' }, asOf: new Date(NOW.getTime() - 6 * 3600 * 1000).toISOString() },
  projectionRounds: [20, 21],
  alerts: [],
  meetings: [meeting(1297, 'United States Grand Prix', '2026-10-25T20:00:00+00:00'), meeting(1298, 'Mexico City Grand Prix', '2026-11-01T20:00:00+00:00'), meeting(1299, 'São Paulo Grand Prix', '2026-11-08T17:00:00+00:00')],
});

const levels = (r, check) => r.findings.filter((f) => f.check === check).map((f) => f.level);

test('a healthy state is OK on every check', () => {
  const r = evaluate(healthy(), NOW);
  assert.equal(r.worst, 'ok');
  assert.equal(r.round, 21);
  assert.ok(!r.findings.some((f) => f.level !== 'ok'), JSON.stringify(r.findings));
});

test('the 2026-10-11 hang: old heartbeat, payload two rounds behind, no projections for the round', () => {
  const s = healthy();
  s.worker = { lastTickAt: NOW.getTime() - 18 * 24 * 3600 * 1000, round: 19, lastRun: null };
  s.newestPublic = { round: { number: 19, name: 'Singapore' }, asOf: '2026-10-06T06:01:41.285Z' };
  s.projectionRounds = [19];
  const r = evaluate(s, NOW);
  assert.equal(r.worst, 'fail');
  assert.deepEqual(levels(r, 'worker'), ['fail', 'warn']);
  assert.match(r.findings.find((f) => f.check === 'payload').text, /round 19 \(Singapore\), the calendar is on round 21 mexico_2026/);
  assert.deepEqual(levels(r, 'projections'), ['warn']);
});

test('a payload for the right round but older than 30 h fails', () => {
  const s = healthy();
  s.newestPublic.asOf = new Date(NOW.getTime() - 31 * 3600 * 1000).toISOString();
  assert.deepEqual(levels(evaluate(s, NOW), 'payload'), ['fail']);
});

test('a race that happened and is still upcoming is a scoring failure', () => {
  const s = healthy();
  s.races[0].status = 'upcoming';
  const r = evaluate(s, NOW);
  assert.deepEqual(levels(r, 'scoring'), ['fail']);
  // and the current round is then the unscored one, so the payload is called out too
  assert.equal(r.round, 20);
});

test('a moved session is a warn under an hour and a fail at an hour or more', () => {
  const s = healthy();
  s.meetings[1].sessions.push({ session_name: 'Qualifying', date_start: '2026-10-31T21:30:00+00:00' });
  s.races[1].schedule.qualifying = '2026-10-31T21:00:00.000Z';
  let r = evaluate(s, NOW);
  assert.ok(r.findings.some((f) => f.check === 'calendar' && f.level === 'warn' && /qualifying moved \+30 min/.test(f.text)));
  s.meetings[1].sessions[1].date_start = '2026-10-31T23:00:00+00:00';
  r = evaluate(s, NOW);
  assert.ok(r.findings.some((f) => f.check === 'calendar' && f.level === 'fail' && /qualifying moved \+120 min/.test(f.text)));
});

test('a cancelled round has no meeting (fail); an added meeting has no race (warn)', () => {
  const s = healthy();
  s.meetings = [s.meetings[0], s.meetings[1], meeting(1399, 'Somewhere Meeting', '2026-11-15T15:00:00+00:00')];
  const r = evaluate(s, NOW);
  assert.ok(r.findings.some((f) => f.check === 'calendar' && f.level === 'fail' && /brazil_2026 .*no provider meeting/.test(f.text)));
  assert.ok(r.findings.some((f) => f.check === 'calendar' && f.level === 'warn' && /Somewhere Meeting .*added round/.test(f.text)));
});

test('a cancelled round is settled: no scoring failure, no calendar pairing, past meetings ignored', () => {
  const s = healthy();
  s.races.unshift(race('saudi_2026', 5, 'cancelled', '2026-04-19T17:00:00.000Z'));
  s.meetings.unshift(meeting(1250, 'Miami Grand Prix', '2026-05-03T20:00:00+00:00'));
  const r = evaluate(s, NOW);
  assert.equal(r.worst, 'ok', JSON.stringify(r.findings.filter((f) => f.level !== 'ok')));
  assert.ok(r.findings.some((f) => f.check === 'calendar' && /saudi_2026 .*cancelled/.test(f.text)));
});

test('pairRounds matches by race date, not by name, and never reuses a meeting', () => {
  const races = [race('a', 1, 'upcoming', '2026-11-01T20:00:00Z'), race('b', 2, 'upcoming', '2026-11-08T17:00:00Z')];
  const meetings = [meeting(2, 'B', '2026-11-08T17:00:00Z'), meeting(1, 'A', '2026-11-01T20:30:00Z')];
  const { pairs, unmatchedRaces, unmatchedMeetings } = pairRounds(races, meetings);
  assert.deepEqual(pairs.map((p) => [p.race.id, p.meeting.meeting_key]), [['a', 1], ['b', 2]]);
  assert.equal(unmatchedRaces.length + unmatchedMeetings.length, 0);
});

test('sessionDrift reports a sprint we list that the provider dropped, and ignores sessions it does not know', () => {
  const r = race('x', 1, 'upcoming', '2026-11-01T20:00:00Z', { schedule: { sprint: '2026-10-31T18:00:00Z' } });
  const d = sessionDrift(r, [{ session_name: 'Race', date_start: '2026-11-01T20:00:00+00:00' }, { session_name: 'Day 1', date_start: '2026-10-30T10:00:00+00:00' }]);
  assert.deepEqual(d.map((x) => [x.key, x.theirs]), [['sprint', null]]);
});

test('currentRound prefers an in-progress race over an earlier upcoming one', () => {
  assert.equal(currentRound([race('u', 3, 'upcoming', '2026-11-08T17:00:00Z'), race('p', 4, 'in_progress', '2026-11-15T17:00:00Z')]).id, 'p');
  assert.equal(currentRound([race('d', 3, 'completed', '2026-11-08T17:00:00Z')]), null);
});
