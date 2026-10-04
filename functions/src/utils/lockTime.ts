import * as admin from 'firebase-admin';

/**
 * When team edits lock for a race weekend.
 *
 * Sprint weekends lock at Sprint Qualifying — it is the first session whose
 * outcome scores to rosters (sprint points fold into driver totals), so edits
 * after it would let users react to results they've already seen. Normal
 * weekends lock at Qualifying. Falls back to Qualifying when a sprint
 * weekend's sprintQualifying time hasn't been synced yet.
 */
export function effectiveLockTime(
  race: FirebaseFirestore.DocumentData,
): admin.firestore.Timestamp | null {
  if (race.hasSprint && race.schedule?.sprintQualifying) {
    return race.schedule.sprintQualifying;
  }
  return race.schedule?.qualifying ?? null;
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
  const sprint: admin.firestore.Timestamp | null = race.schedule?.sprint ?? null;
  if (sprint && qualifying) return sprint.toMillis() <= qualifying.toMillis() ? sprint : qualifying;
  return sprint ?? qualifying ?? race.schedule?.race ?? null;
}
