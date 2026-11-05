// F-134. A stand-in the provider lists with no team in one session takes the team the same car
// carried elsewhere in the meeting (Mexico City 2026 Race: Hirakawa, car 50, team null in the Race
// record, "Haas F1 Team" in practice and qualifying). node --test test/*.test.js after npm run build.
const test = require('node:test');
const assert = require('node:assert/strict');
const { teamsFromDrivers, fillTeamsFromMeeting } = require('../lib/ingestion/openf1Client.js');
const { DRIVER_NUMBER_TO_ID } = require('../lib/ingestion/config.js');

const drv = (driver_number, team_name, session_key, meeting_key = 1298) => ({ driver_number, team_name, full_name: `#${driver_number}`, name_acronym: 'XXX', session_key, meeting_key });

const RACE = 11404;
const raceDrivers = [drv(87, 'Haas F1 Team', RACE), drv(50, null, RACE), drv(3, 'Red Bull Racing', RACE)];
const meetingDrivers = [
  ...raceDrivers,
  drv(50, 'Haas F1 Team', 11397), drv(50, 'Haas F1 Team', 11399), drv(50, 'Haas F1 Team', 11400), // FP1, FP3, Qualifying
  drv(31, 'Haas F1 Team', 11400), // Ocon qualified, did not race
  drv(3, 'Red Bull Racing', 11400),
];

test('a session record with team null leaves the car out of the team map', () => {
  assert.deepEqual(teamsFromDrivers(raceDrivers), { 87: 'haas', 3: 'red_bull' });
});

test('the meeting fills the missing team from the latest session that names one, with a warning', () => {
  const warnings = [];
  const teams = fillTeamsFromMeeting(teamsFromDrivers(raceDrivers), raceDrivers, meetingDrivers, warnings);
  assert.deepEqual(teams, { 87: 'haas', 3: 'red_bull', 50: 'haas' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Team for driver 50 taken from session 11400 of the meeting \(Haas F1 Team\)/);
});

test('a car the meeting never attaches to a known team stays unresolved; cars already mapped are untouched', () => {
  const warnings = [];
  const session = [drv(99, null, RACE), drv(87, 'Haas F1 Team', RACE)];
  const teams = fillTeamsFromMeeting(teamsFromDrivers(session), session, [...session, drv(99, 'Mystery Team', 11400), drv(87, 'Mercedes', 11400)], warnings);
  assert.deepEqual(teams, { 87: 'haas' });
  assert.deepEqual(warnings, []);
});

test('the same session is never used as its own fallback', () => {
  const warnings = [];
  const session = [drv(50, null, RACE)];
  assert.deepEqual(fillTeamsFromMeeting({}, session, session, warnings), {});
  assert.deepEqual(warnings, []);
});

test('car 50 maps to its current Haas occupant (F-138: the Mexico stand-in resolves by name) and every regular 2026 number still maps', () => {
  assert.equal(DRIVER_NUMBER_TO_ID[50], 'camara');
  assert.equal(require('../lib/ingestion/config.js').driverIdFor(50, 'HIR'), 'hirakawa');
  assert.equal(DRIVER_NUMBER_TO_ID[31], 'ocon');
  assert.equal(DRIVER_NUMBER_TO_ID[87], 'bearman');
  assert.equal(DRIVER_NUMBER_TO_ID[22], 'tsunoda');
});

const { teamsForSession, noTeamWarning, isUnmappedDriverWarning } = require('../lib/ingestion/openf1Client.js');

test('a car with no team even after the fill blocks auto-approval like an unknown number', () => {
  assert.equal(isUnmappedDriverWarning(noTeamWarning(50, 'hirakawa', 'race')), true);
  assert.equal(isUnmappedDriverWarning(noTeamWarning(50, 'hirakawa', 'qualifying')), true);
  assert.match(noTeamWarning(50, 'hirakawa', 'race'), /no team for race driver 50 \(hirakawa\)/);
  // the fill's own warning must NOT block: it means the car was resolved
  const warnings = [];
  fillTeamsFromMeeting(teamsFromDrivers(raceDrivers), raceDrivers, meetingDrivers, warnings);
  assert.equal(isUnmappedDriverWarning(warnings[0]), false);
});

test('teamsForSession calls the meeting only when a car lacks a team, and degrades to a warning when that call fails', async () => {
  let calls = 0;
  const ok = async () => { calls += 1; return meetingDrivers; };
  // every car has a team: no call
  const full = [drv(87, 'Haas F1 Team', RACE), drv(3, 'Red Bull Racing', RACE)];
  assert.deepEqual(await teamsForSession(full, [], ok), { 87: 'haas', 3: 'red_bull' });
  assert.equal(calls, 0);
  // one car without a team: one call, filled
  const w1 = [];
  assert.deepEqual(await teamsForSession(raceDrivers, w1, ok), { 87: 'haas', 3: 'red_bull', 50: 'haas' });
  assert.equal(calls, 1);
  assert.equal(w1.length, 1);
  // the call fails: teams unchanged, one warning, nothing thrown
  const w2 = [];
  assert.deepEqual(await teamsForSession(raceDrivers, w2, async () => { throw new Error('OpenF1 API error: 503'); }), { 87: 'haas', 3: 'red_bull' });
  assert.equal(w2.length, 1);
  assert.match(w2[0], /Could not fetch the meeting's drivers to fill 1 missing team\(s\): OpenF1 API error: 503/);
  // no meeting_key on the records: skipped with a warning, no call
  const noMk = raceDrivers.map((d) => ({ ...d, meeting_key: undefined }));
  const w3 = [];
  assert.deepEqual(await teamsForSession(noMk, w3, ok), { 87: 'haas', 3: 'red_bull' });
  assert.equal(calls, 1);
  assert.match(w3[0], /no meeting_key/);
});
