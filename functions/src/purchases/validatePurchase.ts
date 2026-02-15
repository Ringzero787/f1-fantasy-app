import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

const db = admin.firestore();

const PACKAGE_NAME = 'com.f1fantasy.app';

/**
 * Verify an iOS receipt against Apple's verifyReceipt endpoint.
 * Automatically retries against sandbox if production returns status 21007.
 */
async function verifyAppleReceipt(
  receiptData: string,
  productId: string
): Promise<{ valid: boolean; transactionId?: string; error?: string }> {
  const sharedSecret = functions.config().apple?.shared_secret;
  if (!sharedSecret) {
    return { valid: false, error: 'Apple shared secret not configured' };
  }

  const payload = JSON.stringify({
    'receipt-data': receiptData,
    password: sharedSecret,
  });

  async function postToApple(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    return response.json() as Promise<Record<string, unknown>>;
  }

  try {
    let result = await postToApple('https://buy.itunes.apple.com/verifyReceipt');

    // Status 21007 means sandbox receipt sent to production — retry against sandbox
    if (result.status === 21007) {
      result = await postToApple('https://sandbox.itunes.apple.com/verifyReceipt');
    }

    if (result.status !== 0) {
      return { valid: false, error: `Apple verification failed (status: ${result.status})` };
    }

    // Find matching in-app purchase in the receipt
    const receipt = result.receipt as Record<string, unknown> | undefined;
    const inApp = (receipt?.in_app as Array<Record<string, unknown>>) || [];
    const match = inApp.find((item) => item.product_id === productId);

    if (!match) {
      return { valid: false, error: `Product ${productId} not found in receipt` };
    }

    return { valid: true, transactionId: match.transaction_id as string };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Apple receipt verification failed:', message);
    return { valid: false, error: message };
  }
}

/**
 * Verify a purchase token against Google Play Developer API.
 * Uses Application Default Credentials (works automatically in Cloud Functions).
 */
async function verifyGooglePlayPurchase(
  productId: string,
  purchaseToken: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}`;
    const response = await client.request({ url });
    const data = response.data as Record<string, unknown>;

    // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    if (data.purchaseState !== 0) {
      return { valid: false, error: `Purchase not completed (state: ${data.purchaseState})` };
    }

    // consumptionState: 0 = not consumed, 1 = consumed
    if (data.consumptionState !== 0) {
      return { valid: false, error: 'Purchase already consumed' };
    }

    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Google Play verification failed:', message);
    return { valid: false, error: message };
  }
}

/**
 * Records a validated purchase in Firestore.
 * Idempotent: duplicate purchaseTokens are rejected gracefully.
 * Validates purchase tokens against Google Play (skipped for demo tokens).
 */
export const validatePurchase = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { productId, purchaseToken, transactionReceipt, transactionId, platform } = data;
  const isIOS = platform === 'ios';

  if (!productId) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is required');
  }

  if (isIOS && !transactionReceipt) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'transactionReceipt is required for iOS purchases'
    );
  }

  if (!isIOS && !purchaseToken) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'purchaseToken is required for Android purchases'
    );
  }

  const userId = context.auth.uid;

  // Check for duplicate (idempotent) — iOS uses transactionId, Android uses purchaseToken
  if (isIOS && transactionId) {
    const existing = await db
      .collection('purchases')
      .where('transactionId', '==', transactionId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return { success: true, purchaseId: existing.docs[0].id, duplicate: true };
    }
  } else if (!isIOS && purchaseToken) {
    const existing = await db
      .collection('purchases')
      .where('purchaseToken', '==', purchaseToken)
      .limit(1)
      .get();
    if (!existing.empty) {
      return { success: true, purchaseId: existing.docs[0].id, duplicate: true };
    }
  }

  // Reject demo tokens server-side — demo bypass should only exist in client store
  if (typeof purchaseToken === 'string' && purchaseToken.startsWith('demo_')) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Demo tokens are not valid for server-side purchase validation'
    );
  }

  // Verify purchase with the appropriate store
  if (isIOS) {
    const verification = await verifyAppleReceipt(transactionReceipt, productId);
    if (!verification.valid) {
      console.warn(`Invalid iOS receipt from user ${userId}: ${verification.error}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid iOS receipt');
    }
  } else {
    const verification = await verifyGooglePlayPurchase(productId, purchaseToken);
    if (!verification.valid) {
      console.warn(`Invalid purchase token from user ${userId}: ${verification.error}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid purchase token');
    }
  }

  // Record the purchase with platform-specific fields
  const purchaseRecord: Record<string, unknown> = {
    userId,
    productId,
    platform: isIOS ? 'ios' : 'android',
    status: 'validated',
    validatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (isIOS) {
    purchaseRecord.transactionReceipt = transactionReceipt;
    if (transactionId) purchaseRecord.transactionId = transactionId;
  } else {
    purchaseRecord.purchaseToken = purchaseToken;
  }

  const purchaseRef = await db.collection('purchases').add(purchaseRecord);

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
