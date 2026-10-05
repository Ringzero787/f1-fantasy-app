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
 * That last fallback exists so the stack fails CLOSED (F-103). Returning null
 * drops the race out of `autoLockTeams`'s `dueRaces` filter, so nothing is ever
 * stamped: no `isLocked`, no `canModify`, no ace window — while
 * `checkQualifyingResults` scores qualifying off OpenF1 session keys without
 * consulting this document at all. A partially synced schedule would then let a
 * player watch qualifying and re-pick before the scorer ran. Locking at the
 * race is late, but it is a deadline; null is not. `aceFreezeStart` below has
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

/** Human label for the session that locks the weekend (for messages). */
export function lockSessionLabel(race: FirebaseFirestore.DocumentData): string {
  return race.hasSprint && race.schedule?.sprintQualifying
    ? 'sprint qualifying'
    : 'qualifying';
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
