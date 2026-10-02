// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// ROUND_TO_RACE_ID maps the round numbers derived from OpenF1 meetings onto our
// race documents. Four jobs depend on it — syncSchedule (writes session times),
// checkResults (qualifying and sprint results), and scheduleMonitor — so a
// wrong entry silently files a race weekend's data against the wrong race.
//
// That happened on 2026-10-01: the cancelled Bahrain GP was reinstated at
// Sepang and inserted as round 18, shifting Singapore..Abu Dhabi up one. The
// renumber updated SPRINT_ROUNDS but missed this table, so the sync wrote
// Bahrain's session times onto singapore_2026. Two races then sat inside the
// missing-picks 24h window, which thrashed that job's single-race dedupe stamp
// and sent players ~28 duplicate notifications. Nothing tested this table.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROUND_TO_RACE_ID, SPRINT_ROUNDS } = require('../lib/ingestion/config.js');

// The race calendar is shared: both apps read the same `races` collection, and
// this JSON is what seeds it, so it is the authority on which round is which.
const SEED = path.join(__dirname, '..', '..', 'newgame', 'functions', 'src', 'triggers', '_seedRacesData.json');

function seedRaces() {
  if (!fs.existsSync(SEED)) return null;
  const parsed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.races || Object.values(parsed);
}

test('every mapped round points at a distinct race id', () => {
  const ids = Object.values(ROUND_TO_RACE_ID);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], 'two rounds map to the same race');
  for (const [round, id] of Object.entries(ROUND_TO_RACE_ID)) {
    assert.match(id, /^[a-z_]+_\d{4}$/, `round ${round} maps to a malformed id: ${id}`);
  }
});

test('cancelled rounds stay unmapped so their meetings are never synced', () => {
  // OpenF1 still lists the April Sakhir and Jeddah meetings, so these rounds do
  // get derived — they must map to nothing, or cancelled April sessions would
  // be written over live race docs.
  assert.equal(ROUND_TO_RACE_ID[4], undefined, 'round 4 (cancelled Bahrain at Sakhir) must stay unmapped');
  assert.equal(ROUND_TO_RACE_ID[5], undefined, 'round 5 (cancelled Saudi) must stay unmapped');
});

test('the 2026 tail reflects Bahrain reinstated at Sepang as round 18', () => {
  assert.equal(ROUND_TO_RACE_ID[17], 'azerbaijan_2026');
  assert.equal(ROUND_TO_RACE_ID[18], 'bahrain_2026', 'round 18 is Bahrain run at Sepang, not Singapore');
  assert.equal(ROUND_TO_RACE_ID[19], 'singapore_2026');
  assert.equal(ROUND_TO_RACE_ID[20], 'usa_2026');
  assert.equal(ROUND_TO_RACE_ID[25], 'abu_dhabi_2026', 'the season now runs to round 25');
});

// The check that would have caught the 2026-10-01 regression outright.
test('ROUND_TO_RACE_ID agrees with the seeded race calendar', () => {
  const races = seedRaces();
  if (!races) return; // seed file not present in this checkout
  const byRound = new Map();
  for (const r of races) byRound.set(r.round, r);

  for (const [roundStr, raceId] of Object.entries(ROUND_TO_RACE_ID)) {
    const round = Number(roundStr);
    const seeded = byRound.get(round);
    assert.ok(seeded, `round ${round} maps to ${raceId} but no seeded race holds that round`);
    assert.equal(
      seeded.id,
      raceId,
      `round ${round}: mapping says ${raceId}, calendar says ${seeded.id}`
    );
  }

  // Every race still to be run must be reachable, or its results and schedule
  // updates are silently dropped.
  for (const r of races) {
    if (r.status === 'cancelled') continue;
    assert.equal(
      ROUND_TO_RACE_ID[r.round],
      r.id,
      `${r.id} (round ${r.round}) is not mapped — its OpenF1 data would be discarded`
    );
  }
});

test('sprint rounds are mapped and match the calendar flags', () => {
  const races = seedRaces();
  for (const round of SPRINT_ROUNDS) {
    assert.ok(ROUND_TO_RACE_ID[round], `sprint round ${round} has no race mapping`);
  }
  if (!races) return;
  const byRound = new Map(races.map((r) => [r.round, r]));
  // A round flagged as a sprint here must be a sprint weekend in the calendar.
  for (const round of SPRINT_ROUNDS) {
    const r = byRound.get(round);
    assert.ok(r, `sprint round ${round} missing from the calendar`);
    assert.equal(r.hasSprint, true, `round ${round} (${r.id}) is in SPRINT_ROUNDS but hasSprint is not true`);
  }
  // …and the converse: a sprint weekend in the calendar must be listed here, or
  // its sprint results are never ingested.
  for (const r of races) {
    if (r.hasSprint !== true) continue;
    assert.ok(SPRINT_ROUNDS.has(r.round), `${r.id} is a sprint weekend at round ${r.round} but SPRINT_ROUNDS omits it`);
  }
});
