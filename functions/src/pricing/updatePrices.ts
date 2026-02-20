import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';

const db = admin.firestore();

/**
 * Get price history for a driver or constructor
 */
export const getPriceHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'getPriceHistory');
  const { entityId, entityType, limit: rawLimit = 10 } = data;
  const limit = Math.min(Math.max(1, Number(rawLimit) || 10), 100);

  if (!entityId || !entityType) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'entityId and entityType are required'
    );
  }

  const historySnapshot = await db
    .collection('priceHistory')
    .where('entityId', '==', entityId)
    .where('entityType', '==', entityType)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  return historySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  }));
});
