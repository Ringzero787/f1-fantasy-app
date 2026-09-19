/**
 * Server-owned league member count (F-059).
 *
 * `leagues/{id}.memberCount` used to be maintained by the client: +1 after
 * joining, −1 after leaving. That made it forgeable (a non-member could nudge
 * it down, a member could re-join to push it up until the league looked full).
 * The count is now DERIVED: whenever a member doc changes, or anyone changes
 * `memberCount` on the league doc, it is recomputed from the members
 * subcollection (approved members only) and corrected if it differs.
 *
 * Released clients still write their own ±1. That is harmless: whatever they
 * write, the league-update trigger recounts and puts the truth back, and a
 * correct value causes no write, so the two triggers cannot loop.
 */
import { onDocumentWritten, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/** A member counts once their join is approved; docs without a status are approved (owners, legacy docs). */
export function countsAsMember(member: { status?: unknown } | undefined | null): boolean {
  return !!member && member.status !== 'pending';
}

export function approvedMemberCount(members: Array<{ status?: unknown }>): number {
  return members.filter(countsAsMember).length;
}

/** Did this member write change who counts? (create, delete, or a pending ↔ approved flip) */
export function membershipChanged(before: { status?: unknown } | undefined, after: { status?: unknown } | undefined): boolean {
  return countsAsMember(before) !== countsAsMember(after);
}

/** Recount a league and correct `memberCount` if it is wrong. Returns the true count, or null if the league is gone. */
export async function reconcileMemberCount(leagueId: string): Promise<number | null> {
  const leagueRef = db.doc(`leagues/${leagueId}`);
  return db.runTransaction(async (tx) => {
    const league = await tx.get(leagueRef);
    if (!league.exists) return null;
    const members = await tx.get(leagueRef.collection('members'));
    const truth = approvedMemberCount(members.docs.map((d) => d.data()));
    if (league.data()?.memberCount !== truth) {
      tx.update(leagueRef, { memberCount: truth, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log('[memberCount] corrected league', leagueId, 'from', league.data()?.memberCount, 'to', truth);
    }
    return truth;
  });
}

// retry: reconcile is idempotent, and a dropped invocation would leave the count
// wrong (a count stuck too high blocks joins, since the join rule reads it).
export const onLeagueMemberWritten = onDocumentWritten(
  { document: 'leagues/{leagueId}/members/{memberId}', retry: true },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (!membershipChanged(before, after)) return;
    await reconcileMemberCount(event.params.leagueId);
  },
);

export const onLeagueMemberCountChanged = onDocumentUpdated(
  { document: 'leagues/{leagueId}', retry: true },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.memberCount === after.memberCount) return;
    await reconcileMemberCount(event.params.leagueId);
  },
);

/** Daily safety net: recount every league, so any missed event is bounded to a day. */
export const reconcileAllLeagueMemberCounts = onSchedule('every 24 hours', async () => {
  const leagues = await db.collection('leagues').select().get();
  let failed = 0;
  for (const l of leagues.docs) {
    try { await reconcileMemberCount(l.id); } catch (e) { failed++; console.error('[memberCount] sweep failed for league', l.id, e); }
  }
  console.log('[memberCount] swept', leagues.size, 'leagues,', failed, 'failed');
});
