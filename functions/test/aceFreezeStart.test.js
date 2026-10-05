// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-098. `aceFreezeStart` decides when the ace stops moving for a weekend, and
// `autoLockTeams` stamps that moment onto every team it covers. Three sessions score with
// the ace applied — qualifying, the sprint, the race — so the freeze has to begin at the
// first of them. Start it too late and the exploit this exists to close is still open for
// that session: watch the sprint, point your ace at whoever won it, have those points
// doubled minutes later when the scorer runs.
//
// The ordering here is not hypothetical. On a 2026 sprint weekend the sprint runs on
// Saturday morning and qualifying on Saturday afternoon, so the earlier of the two is the
// sprint; on a normal weekend there is no sprint and qualifying is the first. Taking
// `schedule.qualifying` unconditionally would have left every sprint round unprotected
// for the length of a sprint.
const test = require('node:test');
const assert = require('node:assert/strict');
const { aceFreezeStart, effectiveLockTime, lockSessionLabel } = require('../lib/utils/lockTime.js');

/** A Firestore Timestamp is only ever read through toMillis() here. */
const ts = (iso) => ({ toMillis: () => Date.parse(iso), iso });

const SPRINT_WEEKEND = {
  hasSprint: true,
  schedule: {
    sprintQualifying: ts('2026-10-09T14:00:00Z'),
    sprint: ts('2026-10-10T08:00:00Z'),
    qualifying: ts('2026-10-10T12:00:00Z'),
    race: ts('2026-10-11T12:00:00Z'),
  },
};
const NORMAL_WEEKEND = {
  hasSprint: false,
  schedule: {
    fp3: ts('2026-10-03T07:30:00Z'),
    qualifying: ts('2026-10-03T11:00:00Z'),
    race: ts('2026-10-04T09:00:00Z'),
  },
};

test('a normal weekend freezes the ace from qualifying', () => {
  assert.equal(aceFreezeStart(NORMAL_WEEKEND).iso, '2026-10-03T11:00:00Z');
});

test('a sprint weekend freezes the ace from the sprint, which comes first', () => {
  assert.equal(aceFreezeStart(SPRINT_WEEKEND).iso, '2026-10-10T08:00:00Z');
});

test('the sprint is recognised by its time, not by the hasSprint flag', () => {
  // syncSchedule treats schedule.sprint as the definitive marker and only ever flips the
  // flag to true, so a stale false must not push the freeze past the sprint.
  const staleFlag = { ...SPRINT_WEEKEND, hasSprint: false };
  assert.equal(aceFreezeStart(staleFlag).iso, '2026-10-10T08:00:00Z');
});

test('a sprint round with no sprint time yet falls back to sprint qualifying, not past it', () => {
  // OpenF1 has not published the sessions, so the doc has the flag from seed data and no
  // sprint time. Falling through to qualifying would start the freeze hours after the
  // sprint — the hole, in the one case the flag exists to warn about. autoLockTeams
  // stamps the sprint marker on the same condition, so the two fail closed together.
  const unpublished = {
    hasSprint: true,
    schedule: { sprintQualifying: ts('2026-10-09T14:00:00Z'), qualifying: ts('2026-10-10T12:00:00Z'), race: ts('2026-10-11T12:00:00Z') },
  };
  assert.equal(aceFreezeStart(unpublished).iso, '2026-10-09T14:00:00Z');
  // without the flag there is no sprint to protect, so qualifying is right
  assert.equal(aceFreezeStart({ ...unpublished, hasSprint: false }).iso, '2026-10-10T12:00:00Z');
});

test('a sprint scheduled after qualifying still freezes from qualifying', () => {
  const reordered = {
    hasSprint: true,
    schedule: { ...SPRINT_WEEKEND.schedule, sprint: ts('2026-10-10T16:00:00Z') },
  };
  assert.equal(aceFreezeStart(reordered).iso, '2026-10-10T12:00:00Z');
});

test('it falls back rather than returning nothing when the schedule is partial', () => {
  assert.equal(aceFreezeStart({ hasSprint: true, schedule: { sprint: ts('2026-10-10T08:00:00Z'), race: ts('2026-10-11T12:00:00Z') } }).iso, '2026-10-10T08:00:00Z');
  assert.equal(aceFreezeStart({ schedule: { race: ts('2026-10-11T12:00:00Z') } }).iso, '2026-10-11T12:00:00Z');
  assert.equal(aceFreezeStart({ schedule: {} }), null);
  assert.equal(aceFreezeStart({}), null);
});

test('the ace freeze and the roster lock are different moments', () => {
  // The roster locks at sprint qualifying on a sprint weekend and at qualifying
  // otherwise; the ace holds on past both until the first session that scores with it.
  // Collapsing the two would throw away the window the ace exists for.
  assert.equal(effectiveLockTime(SPRINT_WEEKEND).iso, '2026-10-09T14:00:00Z');
  assert.ok(aceFreezeStart(SPRINT_WEEKEND).toMillis() > effectiveLockTime(SPRINT_WEEKEND).toMillis());
  assert.equal(effectiveLockTime(NORMAL_WEEKEND).iso, aceFreezeStart(NORMAL_WEEKEND).iso);
});

test('effectiveLockTime falls back to the race rather than to nothing (F-103)', () => {
  // A deadline of null drops the race out of autoLockTeams' dueRaces filter, so nothing is ever
  // stamped — no isLocked, no canModify, no ace window — while checkQualifyingResults still
  // scores qualifying off OpenF1 session keys without consulting this document. A partially
  // synced schedule would then let a player watch qualifying and re-pick before the scorer ran.
  // Locking at the race is late, but it is a deadline. aceFreezeStart has always ended here.
  const noQuali = { hasSprint: false, schedule: { fp3: ts('2026-10-03T07:30:00Z'), race: ts('2026-10-04T09:00:00Z') } };
  assert.equal(effectiveLockTime(noQuali).iso, '2026-10-04T09:00:00Z');
  assert.equal(aceFreezeStart(noQuali).iso, '2026-10-04T09:00:00Z');

  // a sprint weekend whose sprint qualifying has not synced still lands on qualifying
  const unsynced = { hasSprint: true, schedule: { qualifying: ts('2026-10-10T13:00:00Z'), race: ts('2026-10-11T12:00:00Z') } };
  assert.equal(effectiveLockTime(unsynced).iso, '2026-10-10T13:00:00Z');

  // and with nothing to go on, nothing — there is no deadline to invent
  assert.equal(effectiveLockTime({ schedule: {} }), null);
});

test('lockSessionLabel names the session the lock actually came from (F-103)', () => {
  // A lockReason reading "Locked for X qualifying" when the deadline was really the race start
  // is a message nobody can reconcile with the countdown they were shown.
  assert.equal(lockSessionLabel(SPRINT_WEEKEND), 'sprint qualifying');
  assert.equal(lockSessionLabel(NORMAL_WEEKEND), 'qualifying');
  assert.equal(lockSessionLabel({ schedule: { fp3: ts('2026-10-03T07:30:00Z'), race: ts('2026-10-04T09:00:00Z') } }), 'race start');
  assert.equal(lockSessionLabel({ schedule: {} }), 'the weekend');
  // a sprint round whose sprint qualifying has not synced locks at qualifying, and says so
  assert.equal(lockSessionLabel({ hasSprint: true, schedule: { qualifying: ts('2026-10-10T13:00:00Z') } }), 'qualifying');
});
