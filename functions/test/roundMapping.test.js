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
//
// The first version of this test read its calendar from newgame/, and skipped
// every calendar assertion with `if (!races) return` when that file was absent.
// Track Limits moved out of this repo on 2026-10-02, so newgame/ is on its way
// to deletion — the day it went, this suite would have gone green while
// checking nothing. The calendar now lives in this repo as a fixture and a
// missing fixture is a hard failure. A guard that can stop guarding in silence
// is worse than no guard, because it also stops anyone looking.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROUND_TO_RACE_ID, SPRINT_ROUNDS } = require('../lib/ingestion/config.js');

// Undercut's ingestion is the only writer of the shared `races` collection, so
// the round-to-race truth belongs in this repo rather than being borrowed from
// the app that only reads it.
const FIXTURE = path.join(__dirname, 'fixtures', 'races2026.json');

// `status: 'cancelled'` makes the calendar checks below skip a race, so the
// field is an off switch for half this guard: marking a live race cancelled and
// dropping its mapping would otherwise pass green, with that round's OpenF1
// data silently discarded — the 2026-10-01 failure exactly. Pin the cancelled
// set here so retiring a round takes a deliberate edit to this line.
// Round 4 (Bahrain at Sakhir) is absent from the calendar rather than listed as
// cancelled, which is why only round 5 appears.
const CANCELLED_ROUNDS = [5];
const asc = (a, b) => a - b;

function seedRaces() {
  assert.ok(
    fs.existsSync(FIXTURE),
    `the race calendar fixture is missing (${FIXTURE}) — without it this test proves nothing, so it fails instead of passing`
  );
  const parsed = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const races = Array.isArray(parsed) ? parsed : parsed.races;
  assert.ok(
    Array.isArray(races) && races.length > 0,
    'the race calendar fixture parsed but holds no races'
  );
  for (const r of races) {
    assert.equal(typeof r.id, 'string', `a fixture race has no id: ${JSON.stringify(r)}`);
    assert.equal(typeof r.round, 'number', `${r.id} has no round number`);
    assert.ok(
      r.status === 'upcoming' || r.status === 'cancelled',
      `${r.id} has an unexpected status: ${JSON.stringify(r.status)}`
    );
  }
  // Rounds are the key every check below looks races up by, and a Map keeps the
  // last writer — a duplicated round would hide a race rather than fail.
  const rounds = races.map((r) => r.round);
  assert.equal(
    new Set(rounds).size,
    rounds.length,
    'the fixture lists a round twice; one of those races would be silently ignored'
  );
  assert.deepEqual(
    races.filter((r) => r.status === 'cancelled').map((r) => r.round).sort(asc),
    [...CANCELLED_ROUNDS].sort(asc),
    'the set of cancelled rounds changed — if that is real, update CANCELLED_ROUNDS and ROUND_TO_RACE_ID together'
  );
  return races;
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
  const byRound = new Map();
  for (const r of races) byRound.set(r.round, r);

  // Set equality first, both directions at once. The per-race loops below each
  // iterate a collection that the other side could have shrunk; comparing the
  // two round sets outright means neither can go quiet by losing entries.
  assert.deepEqual(
    Object.keys(ROUND_TO_RACE_ID).map(Number).sort(asc),
    races.filter((r) => r.status !== 'cancelled').map((r) => r.round).sort(asc),
    'the mapped rounds and the live calendar rounds are not the same set'
  );

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

// Corroboration while the old tree is still here. This one may legitimately
// skip: it compares the fixture against Track Limits' seed data, which left
// this repo on 2026-10-02 and will eventually be gone. Unlike the original
// `if (!races) return`, nothing above depends on it — the guards have already
// run against the fixture by this point, so skipping costs no coverage. It
// exists only to catch the fixture drifting from the seed it came from while
// both still exist in one checkout.
const TL_SEED = path.join(__dirname, '..', '..', 'newgame', 'functions', 'src', 'triggers', '_seedRacesData.json');

test('the fixture still matches Track Limits seed data, where that tree survives', (t) => {
  if (!fs.existsSync(TL_SEED)) {
    t.skip('newgame/ is gone — Track Limits owns its own copy now, nothing to compare');
    return;
  }
  const parsed = JSON.parse(fs.readFileSync(TL_SEED, 'utf8'));
  const seed = Array.isArray(parsed) ? parsed : parsed.races || Object.values(parsed);
  const shape = (r) => ({ id: r.id, round: r.round, status: r.status, hasSprint: r.hasSprint === true });
  const sortById = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  assert.deepEqual(
    seedRaces().map(shape).sort(sortById),
    seed.map(shape).sort(sortById),
    'functions/test/fixtures/races2026.json has drifted from newgame/.../_seedRacesData.json — ' +
      'reconcile them, and update ROUND_TO_RACE_ID if the calendar really changed'
  );
});
