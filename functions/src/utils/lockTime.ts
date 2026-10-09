import * as admin from 'firebase-admin';

/**
 * When team edits lock for a race weekend.
 *
 * Sprint weekends lock at Sprint Qualifying — it is the first session whose
 * outcome scores to rosters (sprint points fold into driver totals), so edits
 * after it would let users react to results they've already seen. Normal
 * weekends lock at Qualifying. Falls back to Qualifying when a sprint
 * weekend's sprintQualifying time hasn't been synced yet, and to the race
 * itself when even that is missing.
 *
 * That last fallback exists so the stack fails LATE rather than not at all
 * (F-103). Returning null drops the race out of `autoLockTeams`'s `dueRaces`
 * filter, so nothing is ever stamped: no `isLocked`, no `canModify`, no ace
 * window — while `checkQualifyingResults` scores qualifying off OpenF1 session
 * keys without consulting this document at all. A partially synced schedule
 * would then let a player watch qualifying and re-pick with no deadline ever
 * arriving.
 *
 * **It narrows that window, it does not close it.** On this path the lock lands
 * shortly before lights out, which is hours after qualifying has run, so the
 * re-pick is still possible in between — just bounded. The real fix is for the
 * schedule to carry a qualifying time; this is the floor under that. An earlier
 * version of this comment said "fails CLOSED", which was not true and is the
 * sort of claim that stops the next person looking. `aceFreezeStart` below has
 * always ended its chain at the race for the same reason.
 */
export function effectiveLockTime(
  race: FirebaseFirestore.DocumentData,
): admin.firestore.Timestamp | null {
  if (race.hasSprint && race.schedule?.sprintQualifying) {
    return race.schedule.sprintQualifying;
  }
  return race.schedule?.qualifying ?? race.schedule?.race ?? null;
}

/**
 * Human label for the session that locks the weekend (for messages). It has to agree with
 * `effectiveLockTime` above, including that function's last-resort fallback — a lockReason
 * reading "Locked for X qualifying" when the lock actually came from the race start would be a
 * message nobody could reconcile with the countdown they were shown (F-103).
 */
export function lockSessionLabel(race: FirebaseFirestore.DocumentData): string {
  if (race.hasSprint && race.schedule?.sprintQualifying) return 'sprint qualifying';
  if (race.schedule?.qualifying) return 'qualifying';
  return race.schedule?.race ? 'race start' : 'the weekend';
}

/**
 * F-098: the first session of the weekend whose points the ace doubles, and so the moment
 * the ace must stop moving.
 *
 * Three sessions score with the ace applied — qualifying, the sprint and the race
 * (`calculatePoints` doubles in each) — and each is scored by its own scheduled job
 * minutes after the session ends. F-095 froze the ace at lights out, which left the two
 * earlier ones open: you could watch Q3, set your ace to the pole-sitter before
 * `checkQualifyingResults` next ran, and have those points doubled; on a sprint weekend
 * you could watch the whole sprint and do the same.
 *
 * Sprint qualifying is NOT one of them — it is not scored (`checkSprintResults` scores
 * the sprint, `checkQualifyingResults` the Saturday qualifying) — but it is where the
 * ROSTER locks, for the related reason that the sprint follows it. The two locks stay
 * distinct: the roster at `effectiveLockTime`, the ace from here.
 *
 * Keyed off `schedule.sprint` rather than `hasSprint`: syncSchedule calls the time "the
 * definitive marker" and only ever flips the flag to true, so a doc with a sprint time
 * and a stale flag would freeze from qualifying — hours AFTER the sprint it has to
 * cover. The scorer does not trust the flag alone either, and a freeze that starts too
 * late is the whole bug.
 */
export function aceFreezeStart(
  race: FirebaseFirestore.DocumentData,
): admin.firestore.Timestamp | null {
  const qualifying: admin.firestore.Timestamp | null = race.schedule?.qualifying ?? null;
  // A sprint round whose OpenF1 sessions are not published yet carries the flag from seed
  // data but no time. Falling through to qualifying there would start the freeze hours
  // AFTER the sprint — the hole, in the one case the flag exists to warn about — so fall
  // back to sprint qualifying, which precedes the sprint. `autoLockTeams` stamps the
  // sprint marker on the same `|| hasSprint` condition; the two must fail closed together.
  const sprint: admin.firestore.Timestamp | null =
    race.schedule?.sprint ?? (race.hasSprint === true ? race.schedule?.sprintQualifying ?? null : null);
  if (sprint && qualifying) return sprint.toMillis() <= qualifying.toMillis() ? sprint : qualifying;
  return sprint ?? qualifying ?? race.schedule?.race ?? null;
}

/**
 * Failsafe unlock ceiling. Phase 5 of `onRaceCompleted` schedules the real unlock (3h after the
 * race is scored); this exists only so a cancelled race, or results that never arrive, cannot
 * leave teams locked for the rest of the season. It also bounds the ace freeze, for the same
 * reason — F-095's second rejected shape was a deadline with no end.
 */
export const UNLOCK_FAILSAFE_MS = 24 * 60 * 60 * 1000;

export interface AceWindow {
  aceFreezeFrom: admin.firestore.Timestamp;
  aceLockTime: admin.firestore.Timestamp;
  aceLockUntil: admin.firestore.Timestamp;
  aceQualiKey: string;
  aceSprintKey: string | null;
}

/**
 * The ace freeze window for one race — the single definition of it (F-118).
 *
 * It used to be built inline in `autoLockTeams`, which was the only writer. It is not any more:
 * a team created while a weekend is already live has to be stamped at creation, because the sweep
 * has already run for that race and never comes back for it (the race is `in_progress` and the
 * sweep only looks at `upcoming`). Two copies of this arithmetic would diverge, and the whole
 * failure mode of F-095 and F-098 was a lock deadline that one writer knew about and another did
 * not.
 *
 * Note what this does NOT depend on: the league's `lockDeadline`. The ace locks at lights out and
 * starts scoring at the first session it doubles, both of which come from the race schedule.
 * Keying the window off the league's roster deadline is why `lockDeadline: 'race'` leagues got no
 * freeze at all.
 *
 * Returns null when the race has no usable start, which is the one case the caller must not stamp:
 * a window without an end is F-095's rejected shape.
 */
export function aceWindowFor(
  raceId: string,
  race: FirebaseFirestore.DocumentData,
): AceWindow | null {
  const start = race.schedule?.race;
  if (!start || typeof start.toMillis !== 'function') return null;
  return {
    aceFreezeFrom: aceFreezeStart(race) ?? start,
    aceLockTime: start,
    aceLockUntil: admin.firestore.Timestamp.fromMillis(start.toMillis() + UNLOCK_FAILSAFE_MS),
    aceQualiKey: `quali_${raceId}`,
    // Only on a sprint weekend. The sprint can miss its own scoring run exactly as qualifying
    // can — `onRaceCompleted` then folds it in at race time from a live ace read — so the gap
    // must not open on qualifying alone where there is one. `|| hasSprint` fails CLOSED: a sprint
    // round whose OpenF1 sessions are not published yet has the flag from seed data but no time,
    // and stamping no marker there would let the gap open on qualifying alone — the hole, not the
    // fix.
    aceSprintKey: (race.schedule?.sprint || race.hasSprint === true) ? `sprint_${raceId}` : null,
  };
}

/** The same window as the dotted field paths an `update()` needs. */
export function aceWindowUpdate(w: AceWindow): Record<string, unknown> {
  return {
    'lockStatus.aceFreezeFrom': w.aceFreezeFrom,
    'lockStatus.aceLockTime': w.aceLockTime,
    'lockStatus.aceLockUntil': w.aceLockUntil,
    'lockStatus.aceQualiKey': w.aceQualiKey,
    'lockStatus.aceSprintKey': w.aceSprintKey,
  };
}
