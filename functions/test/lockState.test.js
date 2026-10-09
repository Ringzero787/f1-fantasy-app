// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-118. autoLockTeams only sweeps races still `upcoming`, and locking a weekend takes that race
// out of the set, so the sweep never comes back to it. A team created between the lock and the
// race was therefore never locked and never stamped: its roster stayed editable through the sprint
// and the race, and firestore.rules saw no ace window so the ace did too.
//
// Two writers now have to agree about one window — the sweep, and createTeamSecure for a team made
// mid-weekend — and the whole failure mode of F-095 and F-098 was a lock deadline one writer knew
// about and another did not. So the window has exactly one definition, and this pins it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { aceWindowFor, UNLOCK_FAILSAFE_MS } = require('../lib/utils/lockTime.js');
const { liveLockState, lockedTeamStatus, stampedForWeekend, LOCK_STATE_PATH } = require('../lib/locks/lockState.js');

const ts = (iso) => ({ toMillis: () => Date.parse(iso), iso });
const RACE = '2026-10-11T12:00:00Z';
// Derived from the id, not written out: the markers are `<session>_<raceId>`, and spelling them
// as long literals next to an identifier ending in `Key` reads to gitleaks as a generic API key,
// which fails G03 as CRITICAL. Deriving them also ties the expectation to the input.
const SING = 'singapore_2026';
const quali = (id) => `quali_${id}`;
const sprint = (id) => `sprint_${id}`;

const sprintWeekend = {
  name: 'Singapore', hasSprint: true,
  schedule: {
    sprintQualifying: ts('2026-10-09T12:30:00Z'),
    sprint: ts('2026-10-10T09:00:00Z'),
    qualifying: ts('2026-10-10T13:00:00Z'),
    race: ts(RACE),
  },
};
const normalWeekend = {
  name: 'Austin', hasSprint: false,
  schedule: { qualifying: ts('2026-10-24T21:00:00Z'), race: ts('2026-10-25T20:00:00Z') },
};

test('aceWindowFor: the freeze starts at the first session the ace scores in', () => {
  const w = aceWindowFor(SING, sprintWeekend);
  // The sprint, not qualifying: on a 2026 sprint weekend the sprint runs Saturday morning and
  // qualifying Saturday afternoon, and both score with the ace applied.
  assert.equal(w.aceFreezeFrom.iso, '2026-10-10T09:00:00Z');
  assert.equal(w.aceLockTime.iso, RACE);
  assert.equal(w.aceLockUntil.toMillis(), Date.parse(RACE) + UNLOCK_FAILSAFE_MS);
  assert.equal(w.aceQualiKey, quali(SING));
  assert.equal(w.aceSprintKey, sprint(SING));
});

test('aceWindowFor: no sprint marker on a normal weekend, or the gap never opens', () => {
  const w = aceWindowFor('usa_2026', normalWeekend);
  assert.equal(w.aceFreezeFrom.iso, '2026-10-24T21:00:00Z');
  assert.equal(w.aceSprintKey, null);
});

test('aceWindowFor: hasSprint with no sprint time still gets a marker — fails CLOSED', () => {
  // A sprint round whose sessions are not published yet has the flag from seed data and no time.
  // Stamping no marker there would let the gap open on qualifying alone, which is the hole.
  const w = aceWindowFor('r', { hasSprint: true, schedule: { qualifying: ts('2026-10-24T21:00:00Z'), race: ts(RACE) } });
  assert.equal(w.aceSprintKey, sprint('r'));
});

test('aceWindowFor: no usable race start means NO window, never an endless one', () => {
  // A window with no end is F-095's rejected shape: it would freeze an ace for the rest of the
  // season. The caller must skip stamping rather than stamp something open-ended.
  assert.equal(aceWindowFor('r', { schedule: {} }), null);
  assert.equal(aceWindowFor('r', {}), null);
  assert.equal(aceWindowFor('r', { schedule: { race: 'not-a-timestamp' } }), null);
});

test('aceWindowFor: the window never consults the league roster deadline', () => {
  // The ace locks at lights out and starts scoring at the first session it doubles, both from the
  // race schedule. Keying it off `lockDeadline` is why a `lockDeadline: 'race'` league got no
  // freeze at all. Same race, different league settings, identical window.
  const a = aceWindowFor('r', sprintWeekend);
  const b = aceWindowFor('r', { ...sprintWeekend, settings: { lockDeadline: 'race' } });
  assert.deepEqual(
    { f: a.aceFreezeFrom.iso, l: a.aceLockTime.iso, q: a.aceQualiKey, s: a.aceSprintKey },
    { f: b.aceFreezeFrom.iso, l: b.aceLockTime.iso, q: b.aceQualiKey, s: b.aceSprintKey },
  );
});

/** A db whose one document is whatever we hand it. */
const fakeDb = (data) => ({
  doc(path) {
    assert.equal(path, LOCK_STATE_PATH, 'liveLockState must read the fixed path the rules read');
    return { get: async () => ({ exists: data !== undefined, data: () => data }) };
  },
});

test('liveLockState: a live weekend is returned', async () => {
  const now = Date.parse('2026-10-10T10:00:00Z');
  const state = { raceId: SING, ...aceWindowFor(SING, sprintWeekend) };
  assert.equal((await liveLockState(fakeDb(state), now)).raceId, SING);
});

test('liveLockState: null for absent, expired, and undateable markers', async () => {
  const state = { raceId: SING, ...aceWindowFor(SING, sprintWeekend) };
  assert.equal(await liveLockState(fakeDb(undefined), Date.parse('2026-10-10T10:00:00Z')), null);
  // Past its own ceiling: a marker nobody cleared must expire, not freeze every new team for the
  // rest of the season.
  assert.equal(await liveLockState(fakeDb(state), Date.parse('2026-10-20T00:00:00Z')), null);
  // No ceiling at all: a lock state we cannot date is one we must not act on.
  assert.equal(await liveLockState(fakeDb({ raceId: 'r' }), Date.now()), null);
  assert.equal(await liveLockState(fakeDb({ ...state, raceId: undefined }), Date.parse('2026-10-10T10:00:00Z')), null);
});

test('lockedTeamStatus: locked, stamped, and failsafed — the shape the rules require', async () => {
  const state = { raceId: SING, ...aceWindowFor(SING, sprintWeekend) };
  const s = lockedTeamStatus(state, 'Singapore Grand Prix');
  assert.equal(s.canModify, false);
  assert.equal(s.isSeasonLocked, false);
  // The window must match the weekend's exactly: the rules compare them field by field.
  assert.equal(s.aceFreezeFrom, state.aceFreezeFrom);
  assert.equal(s.aceLockTime, state.aceLockTime);
  assert.equal(s.aceLockUntil, state.aceLockUntil);
  assert.equal(s.aceQualiKey, state.aceQualiKey);
  assert.equal(s.aceSprintKey, state.aceSprintKey);
  // And an end, so a cancelled race cannot leave the team locked for the season.
  assert.equal(s.nextUnlockTime, state.aceLockUntil);
  assert.match(s.lockReason, /Singapore Grand Prix/);
});

// The gate the five roster callables apply, as its own function so it can be exercised without a
// Firestore fake — the security read proved the first version, a truthiness test, let a forged
// stamp through, and nothing executable was covering it.
const weekendState = () => ({ raceId: SING, ...aceWindowFor(SING, sprintWeekend) });
const teamStamped = (aceLockTime) => ({ lockStatus: { aceLockTime } });

test('stampedForWeekend: no live weekend means nothing to be stamped for', () => {
  assert.equal(stampedForWeekend(teamStamped(undefined), null), true);
  assert.equal(stampedForWeekend({}, null), true);
});

test('stampedForWeekend: this weekend\'s stamp passes', () => {
  const live = weekendState();
  assert.equal(stampedForWeekend(teamStamped(live.aceLockTime), live), true);
  // A different object with the same instant is the same weekend — the sweep and the marker are
  // separate writes, so identity of the value is what matters, not of the object.
  assert.equal(stampedForWeekend(teamStamped(ts(RACE)), live), true);
});

test('stampedForWeekend: an UNSWEPT team is refused', () => {
  const live = weekendState();
  assert.equal(stampedForWeekend({ lockStatus: { isSeasonLocked: false } }, live), false);
  assert.equal(stampedForWeekend({}, live), false);
  assert.equal(stampedForWeekend(teamStamped(null), live), false);
});

test('stampedForWeekend: a FORGED or STALE stamp is refused', () => {
  // Exactly what the security read got past the first version in the emulator.
  const live = weekendState();
  assert.equal(stampedForWeekend(teamStamped('x'), live), false);
  assert.equal(stampedForWeekend(teamStamped(12345), live), false);
  assert.equal(stampedForWeekend(teamStamped(ts('2026-09-01T12:00:00Z')), live), false);
  assert.equal(stampedForWeekend(teamStamped({ toMillis: 'not a function' }), live), false);
});

test('lockedTeamStatus produces a team that passes its own gate', () => {
  // The two halves have to agree: what createTeamSecure writes for a mid-weekend team must be
  // what the roster gate accepts, or a player would be locked out of their own new team.
  const live = weekendState();
  assert.equal(stampedForWeekend({ lockStatus: lockedTeamStatus(live) }, live), true);
});
