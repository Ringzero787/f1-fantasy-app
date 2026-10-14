// F-020. isRaceDueForLock is the one predicate autoLockTeams and createTeamSecure share.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRaceDueForLock, pickDueRace, LOCK_LEAD_MS, WEEKEND_WINDOW_MS } = require('../lib/utils/lockTime.js');

const ts = (iso) => ({ toMillis: () => Date.parse(iso) });

const QUALI = '2026-10-03T11:00:00Z';
const RACE = '2026-10-04T09:00:00Z';
const race = {
  hasSprint: false,
  schedule: { qualifying: ts(QUALI), race: ts(RACE) },
};

test('due from an hour before quali through the weekend', () => {
  const quali = Date.parse(QUALI);
  assert.equal(isRaceDueForLock(race, quali - LOCK_LEAD_MS), true);
  assert.equal(isRaceDueForLock(race, quali - LOCK_LEAD_MS - 1), false);
  assert.equal(isRaceDueForLock(race, quali), true);
  assert.equal(isRaceDueForLock(race, Date.parse(RACE)), true);
});

test('a weekend more than 36h past lights out is not due', () => {
  const raceAt = Date.parse(RACE);
  assert.equal(isRaceDueForLock(race, raceAt + WEEKEND_WINDOW_MS), true);
  assert.equal(isRaceDueForLock(race, raceAt + WEEKEND_WINDOW_MS + 1), false);
});

test('no lock time or no race start is not due', () => {
  assert.equal(isRaceDueForLock({ schedule: { race: ts(RACE) } }, Date.parse(RACE)), true); // lock falls back to race
  assert.equal(isRaceDueForLock({ schedule: { qualifying: ts(QUALI) } }, Date.parse(QUALI)), false);
  assert.equal(isRaceDueForLock({}, Date.now()), false);
});

test('pickDueRace takes the earliest due race', () => {
  const later = {
    id: 'later',
    data: { hasSprint: false, schedule: { qualifying: ts('2026-10-10T11:00:00Z'), race: ts('2026-10-11T09:00:00Z') } },
  };
  const earlier = { id: 'earlier', data: race };
  const now = Date.parse(QUALI);
  assert.equal(pickDueRace([later, earlier], now).id, 'earlier');
  assert.equal(pickDueRace([later], now), null);
});
