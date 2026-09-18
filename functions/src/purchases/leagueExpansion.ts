/**
 * Apply a league expansion from a VALIDATED purchase (F-059).
 *
 * The client used to write `maxMembers` itself after a purchase. This callable
 * is the server path: it finds one unused, store-verified `league.expansion`
 * purchase belonging to the caller, marks it applied and adds the slots to a
 * league the caller owns, all in one transaction, so a purchase can be spent
 * exactly once.
 *
 * Until purchase validation has been proven with a real store purchase, the
 * client keeps its old direct write as a fallback so a paying customer is
 * never left without their slots; the rules stop accepting that write only
 * after this path is confirmed working.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';

const db = admin.firestore();

export const LEAGUE_EXPANSION_PRODUCT = 'league.expansion';
export const SLOTS_PER_EXPANSION = 20;

/** A purchase can be applied when the store verified it and it has not been spent. */
export function isUnusedExpansion(p: { productId?: unknown; status?: unknown; appliedToLeagueId?: unknown } | undefined): boolean {
  return !!p && p.productId === LEAGUE_EXPANSION_PRODUCT && p.status === 'validated' && !p.appliedToLeagueId;
}

export const applyLeagueExpansion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'applyLeagueExpansion');
  const userId = context.auth.uid;
  const leagueId = typeof data?.leagueId === 'string' ? data.leagueId : '';
  if (!leagueId) {
    throw new functions.https.HttpsError('invalid-argument', 'leagueId is required');
  }

  const candidates = await db.collection('purchases')
    .where('userId', '==', userId)
    .where('productId', '==', LEAGUE_EXPANSION_PRODUCT)
    .where('status', '==', 'validated')
    .limit(10)
    .get();

  const leagueRef = db.doc(`leagues/${leagueId}`);
  return db.runTransaction(async (tx) => {
    const league = await tx.get(leagueRef);
    if (!league.exists) throw new functions.https.HttpsError('not-found', 'League not found');
    if (league.data()?.ownerId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Only the league owner can add slots');
    }
    // Re-read each candidate inside the transaction so two calls cannot spend the same purchase.
    for (const c of candidates.docs) {
      const fresh = await tx.get(c.ref);
      if (!isUnusedExpansion(fresh.data())) continue;
      const maxMembers = (league.data()?.maxMembers || 0) + SLOTS_PER_EXPANSION;
      tx.update(c.ref, { status: 'applied', appliedToLeagueId: leagueId, appliedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(leagueRef, { maxMembers, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return { applied: true, maxMembers, purchaseId: c.id };
    }
    throw new functions.https.HttpsError('failed-precondition', 'No unused league expansion purchase found');
  });
});
