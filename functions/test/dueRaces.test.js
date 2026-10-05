// Runs against the SOURCE: the predicate lives inside an onRun handler, so there is nothing
// importable to call. `autoLockTeams` has no Firestore fake and this is the shape guard instead,
// in the spirit of functions/test/sessionScoringShape.test.js.
//
// F-103 removed `ms > nowMs` from the dueRaces filter so a missed sweep could still catch up.
// That also removed the guarantee that at most ONE race is ever due — and the loop stamps the
// ace window on every team once per due race, last write winning. A stale `upcoming` doc sharing
// a sweep with the live weekend would either overwrite the live ace window with past timestamps
// (reopening the F-098 hole) or stamp nextUnlockTime in the past and have autoUnlockTeams free
// every roster half an hour later. Three properties keep that impossible; all three are here
// because the security review found the hole after the first fix, not before it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'locks', 'teamLocks.ts'), 'utf8');
const start = SRC.indexOf('const dueRaces =');
assert.notEqual(start, -1, 'the dueRaces filter is gone — this test needs rewriting with it');
const filter = SRC.slice(start, SRC.indexOf(';', SRC.indexOf('.slice(', start)) + 1);

test('dueRaces takes at most one race per sweep', () => {
  assert.match(filter, /\.slice\(0,\s*1\)/,
    'without this, two due races both stamp every team and the later one wins');
});

test('dueRaces takes the EARLIEST due race, not an arbitrary one', () => {
  assert.match(filter, /\.sort\(/, 'Firestore returns documents in __name__ order, which is alphabetical by race id and unrelated to the calendar');
  assert.match(filter, /effectiveLockTime\(a\.data\(\)\)/, 'the sort must be on the lock time');
});

test('dueRaces refuses a weekend that is already over', () => {
  assert.match(filter, /WEEKEND_WINDOW_MS/,
    'a race left at `upcoming` long after it ran must not be locked: it can only corrupt the live weekend');
  assert.match(filter, /nowMs - raceAt/, 'the staleness test is against the race start');
});

test('dueRaces refuses a race with no start time rather than throwing on it', () => {
  // the lock writes dereference race.schedule.race.toMillis(); a throw here leaves the doc at
  // `upcoming` and every later sweep re-throws on the same document
  assert.match(filter, /typeof raceAt !== 'number'/);
  assert.match(filter, /return false/);
});

test('dueRaces still catches a deadline that has already passed', () => {
  // the whole point of the change: one missed sweep must not drop the weekend for ever
  assert.ok(!/ms > nowMs/.test(filter) && !/toMillis\(\) > nowMs/.test(filter),
    'a lower bound on the lock time is what made a single missed sweep permanent');
  assert.match(filter, /<= oneHourFromNowMs/);
});

test('dueRaces survives a lock time that is not a Timestamp', () => {
  // A hand-repaired or half-synced doc can hold a string where a Timestamp belongs. An
  // unguarded .toMillis() throws before the `status: in_progress` write, so the doc stays
  // `upcoming` and every later sweep throws on it again — and no race after it in iteration
  // order ever locks.
  assert.match(filter, /typeof lockMs !== 'number'/);
  assert.ok(!/effectiveLockTime\(race\)\.toMillis\(\)/.test(filter), 'must not dereference without a guard');
});

test('one bad leagueId cannot reject the whole sweep', () => {
  // db.collection('leagues').doc(id) throws synchronously on an id containing a slash, and the
  // fantasyTeams create rule does not constrain leagueId — so one such team would stop every
  // sweep for every player. The create rule is the real fix; this is the blast shield.
  const body = SRC.slice(SRC.indexOf('const leagueIds'), SRC.indexOf('const leagueDocs'));
  assert.match(body, /includes\('\/'\)/, 'a slash in a leagueId must be filtered before doc()');
});
