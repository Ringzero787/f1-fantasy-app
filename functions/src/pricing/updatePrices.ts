import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Get price history for a driver or constructor
 */
export const getPriceHistory = functions.https.onCall(async (data, context) => {
  const { entityId, entityType, limit = 10 } = data;

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
