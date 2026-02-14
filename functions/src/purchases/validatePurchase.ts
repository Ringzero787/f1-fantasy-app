import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Records a validated purchase in Firestore.
 * Idempotent: duplicate purchaseTokens are rejected gracefully.
 */
export const validatePurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { productId, purchaseToken, platform } = data;

  if (!productId || !purchaseToken) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'productId and purchaseToken are required'
    );
  }

  const userId = context.auth.uid;

  // Check for duplicate token (idempotent)
  const existing = await db
    .collection('purchases')
    .where('purchaseToken', '==', purchaseToken)
    .limit(1)
    .get();

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    return { success: true, purchaseId: existingDoc.id, duplicate: true };
  }

  // Record the purchase
  const purchaseRef = await db.collection('purchases').add({
    userId,
    productId,
    purchaseToken,
    platform: platform || 'android',
    status: 'validated',
    validatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, purchaseId: purchaseRef.id };
});

/**
 * Returns all purchases for the authenticated user, newest first.
 */
export const getUserPurchases = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const userId = context.auth.uid;

  const snapshot = await db
    .collection('purchases')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    validatedAt: doc.data().validatedAt?.toDate()?.toISOString(),
    createdAt: doc.data().createdAt?.toDate()?.toISOString(),
  }));
});
