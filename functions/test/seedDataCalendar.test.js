// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// src/seedData.ts writes the whole races collection. It was the last copy of
// the 2026 calendar that nothing pinned, and it was wrong: Bahrain at round 4
// at Sakhir in April, Saudi still 'upcoming' rather than cancelled, and the
// season tail each one round low. Running it would have written
// singapore_2026.round = 18 while ROUND_TO_RACE_ID[18] is bahrain_2026 — the
// 2026-10-01 misfiling, recreated, with real money settling against it.
//
// It could not be pinned before, because the module called seedDatabase() at
// import time: a test that required it to read the data would have written the
// data instead. That guard came first; this test is what it unlocked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { races, season } = require('../lib/seedData.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'races2026.json');

function fixtureRaces() {
  assert.ok(
    fs.existsSync(FIXTURE),
    `the race calendar fixture is missing (${FIXTURE}) — without it this test proves nothing, so it fails instead of passing`
  );
  const parsed = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const list = Array.isArray(parsed) ? parsed : parsed.races;
  assert.ok(Array.isArray(list) && list.length > 0, 'the race calendar fixture parsed but holds no races');
  return list;
}

const shape = (r) => ({ id: r.id, round: r.round, status: r.status, hasSprint: r.hasSprint === true });
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

test('importing the seeder does not seed', () => {
  // The whole point of the guard. If this file can be required at all, the
  // module-scope seedDatabase() call is gone — a require that seeded would
  // have taken the process down with it long before this assertion.
  assert.ok(Array.isArray(races) && races.length > 0, 'seedData exports no races');
  assert.equal(typeof season, 'object');
});

test('the seeder calendar matches the race calendar fixture exactly', () => {
  // Set equality, so an extra race is caught as surely as a missing one.
  assert.deepEqual(races.map(shape).sort(byId), fixtureRaces().map(shape).sort(byId));
});

test('every seeder round is unique', () => {
  const rounds = races.map((r) => r.round);
  assert.equal(new Set(rounds).size, rounds.length, 'the seeder lists a round twice');
});

test('the seeder would not resurrect the pre-renumber calendar', () => {
  // Named individually because the set comparison above would also pass if the
  // fixture itself were reverted, and because these are the exact values that
  // would misfile race data if this script were ever run with them.
  const round = (id) => races.find((r) => r.id === id)?.round;
  assert.equal(round('bahrain_2026'), 18, 'Bahrain is round 18 at Sepang, not round 4 at Sakhir');
  assert.equal(round('singapore_2026'), 19);
  assert.equal(round('abu_dhabi_2026'), 25);
  assert.equal(races.some((r) => r.round === 4), false, 'round 4 belonged to the cancelled Sakhir race');

  const saudi = races.find((r) => r.id === 'saudi_2026');
  assert.equal(saudi.status, 'cancelled', 'seeding Saudi as upcoming would un-cancel a race whose round is unmapped');

  const bahrain = races.find((r) => r.id === 'bahrain_2026');
  assert.equal(bahrain.city, 'Sepang');
  assert.equal(bahrain.timezone, 'Asia/Kuala_Lumpur');
  assert.equal(bahrain.schedule.race.toDate().getUTCMonth(), 9, 'the reinstated race runs in October');
});

test('the seeder agrees with the ingestion round table', () => {
  // The other half of the same question, and the one that decides whether a
  // race weekend's results land on the right document.
  const { ROUND_TO_RACE_ID, SPRINT_ROUNDS } = require('../lib/ingestion/config.js');
  const live = races.filter((r) => r.status !== 'cancelled');

  assert.deepEqual(
    Object.keys(ROUND_TO_RACE_ID).map(Number).sort((a, b) => a - b),
    live.map((r) => r.round).sort((a, b) => a - b),
    'the mapped rounds and the seeder\'s live rounds are not the same set'
  );
  for (const [roundStr, raceId] of Object.entries(ROUND_TO_RACE_ID)) {
    const seeded = races.find((r) => r.round === Number(roundStr));
    assert.equal(seeded.id, raceId, `round ${roundStr}: mapping says ${raceId}, seeder says ${seeded.id}`);
  }
  assert.deepEqual(
    [...SPRINT_ROUNDS].sort((a, b) => a - b),
    races.filter((r) => r.hasSprint === true).map((r) => r.round).sort((a, b) => a - b),
    'SPRINT_ROUNDS and the seeder\'s sprint weekends disagree'
  );
});
