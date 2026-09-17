import * as admin from 'firebase-admin';

/**
 * The team as it will read after `updateData` lands, so a roster callable can
 * hand the app its new roster without a follow-up read. The extra round-trips
 * this replaced were most of the "slow" in a transfer.
 *
 * Sentinels: `updatedAt` is stamped with the wall clock (the real value is a
 * serverTimestamp the client only uses for ordering), and increments on
 * `lockedPoints`/`totalPoints` are resolved from the `numeric` overrides the
 * caller computes from its own pre-write read. Any other FieldValue in
 * `updateData` is a programming error — it would serialise as an opaque
 * object and be persisted client-side as garbage — so it throws here rather
 * than reaching the app.
 *
 * Kept in its own module (not re-exported from index.ts) so the functions
 * deployer never sees it as a candidate export.
 */
export function projectTeam(
  teamId: string,
  before: FirebaseFirestore.DocumentData,
  updateData: Record<string, any>,
  numeric: { lockedPoints?: number; totalPoints?: number } = {},
): Record<string, any> {
  const after: Record<string, any> = { ...before, id: teamId };
  for (const [k, v] of Object.entries(updateData)) {
    if (k === 'updatedAt' || k === 'lockedPoints' || k === 'totalPoints') continue;
    if (v instanceof admin.firestore.FieldValue) {
      throw new Error(`projectTeam: unresolved FieldValue on "${k}" — resolve it via numeric overrides`);
    }
    after[k] = v;
  }
  if (numeric.lockedPoints !== undefined) after.lockedPoints = numeric.lockedPoints;
  if (numeric.totalPoints !== undefined) after.totalPoints = numeric.totalPoints;
  after.updatedAt = new Date().toISOString();
  return after;
}
