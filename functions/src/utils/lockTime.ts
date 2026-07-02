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
