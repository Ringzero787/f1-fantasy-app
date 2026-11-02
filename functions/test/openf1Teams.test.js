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

test('car 50 maps to the Haas stand-in and every regular 2026 number still maps', () => {
  assert.equal(DRIVER_NUMBER_TO_ID[50], 'hirakawa');
  assert.equal(DRIVER_NUMBER_TO_ID[31], 'ocon');
  assert.equal(DRIVER_NUMBER_TO_ID[87], 'bearman');
  assert.equal(DRIVER_NUMBER_TO_ID[22], 'tsunoda');
});
