import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { verifyAppleTransaction } from './appleTransaction';
import { PASS_PRODUCT, currentSeason } from '../pitwall/pass';
import { grantPass } from '../pitwall/passStore';

const db = admin.firestore();

// The Play package the purchase token belongs to. This was 'com.f1fantasy.app'
// (a pre-launch id), which made every Google Play verification fail.
export const PLAY_PACKAGE_NAME = 'com.undercut.app';
/** The same identifier on the App Store; a signed transaction names the app it belongs to. */
export const IOS_BUNDLE_ID = 'com.undercut.app';
const PACKAGE_NAME = PLAY_PACKAGE_NAME;

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
 * Verify an Amazon Appstore receipt with Amazon's Receipt Verification Service.
 *
 * Amazon needs three things: the shared secret from the developer console, the receipt id (which
 * the client sends as the purchase token) and the Amazon user id, which is per app and per user
 * and is only available from the purchase itself. The secret lives in the function config beside
 * Apple's, deliberately not as a declared secret: firebase resolves every declared secret before
 * it filters a deploy by target, so one missing value would block every functions deploy.
 */
async function verifyAmazonReceipt(
  receiptId: string,
  amazonUserId: string,
  productId: string
): Promise<{ valid: boolean; error?: string }> {
  const sharedSecret = functions.config().amazon?.shared_secret;
  if (!sharedSecret) return { valid: false, error: 'Amazon shared secret not configured' };
  try {
    const url = `https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId/developer/${encodeURIComponent(sharedSecret)}/user/${encodeURIComponent(amazonUserId)}/receiptId/${encodeURIComponent(receiptId)}`;
    const response = await fetch(url);
    if (!response.ok) return { valid: false, error: `Amazon RVS returned ${response.status}` };
    const data = (await response.json()) as Record<string, unknown>;
    if (data.productId !== productId) return { valid: false, error: `Receipt is for ${String(data.productId)}, not ${productId}` };
    // cancelDate is set when a purchase was refunded or revoked.
    if (data.cancelDate) return { valid: false, error: 'Purchase was cancelled' };
    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Amazon receipt verification failed:', message);
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
  warnIfNoAppCheck(context, 'validatePurchase');

  const { productId, purchaseToken, transactionReceipt, transactionId, platform, userIdAmazon } = data;
  const isIOS = platform === 'ios';
  const isAmazon = platform === 'amazon';
  /** 'Production' or 'Sandbox' when the store says so. */
  let environment: string | null = null;
  /**
   * The identifier the store itself confirmed, which is what the purchase is keyed on.
   * Apple: the transaction id inside the signed transaction. Google and Amazon: the token, which
   * the store's own endpoint has just accepted, and which the caller cannot forge.
   */
  let storeTransactionId = '';

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

  if (isAmazon && !userIdAmazon) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'userIdAmazon is required for Amazon purchases'
    );
  }

  const userId = context.auth.uid;

  // Reject demo tokens server-side — demo bypass should only exist in client store
  if (typeof purchaseToken === 'string' && purchaseToken.startsWith('demo_')) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Demo tokens are not valid for server-side purchase validation'
    );
  }

  // Verify purchase with the appropriate store
  if (isIOS) {
    // StoreKit 2 (2.4.0 and later) sends a signed transaction, which the deprecated verifyReceipt
    // endpoint cannot read. Older builds still send a base64 app receipt, so both are accepted.
    const jws = typeof transactionReceipt === 'string' && transactionReceipt.split('.').length === 3;
    const verification = jws
      ? verifyAppleTransaction(transactionReceipt, { expectedBundleId: IOS_BUNDLE_ID, expectedProductId: productId })
      : await verifyAppleReceipt(transactionReceipt, productId);
    if (!verification.valid) {
      console.warn(`Invalid iOS purchase from user ${userId}: ${verification.error}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid iOS purchase');
    }
    // A sandbox transaction is properly signed and is not a sale. Both are accepted so the store
    // review and our own testing work, but which one it was is recorded, so a pass granted from a
    // test purchase can be found and revoked rather than being indistinguishable from a paid one.
    if ('transaction' in verification) {
      if (verification.transaction.environment) environment = verification.transaction.environment;
      storeTransactionId = String(verification.transaction.transactionId ?? '');
    } else {
      // Legacy receipt path: verifyAppleReceipt returns the transaction id it found in the receipt.
      storeTransactionId = String(verification.transactionId ?? '');
    }
    if (!storeTransactionId) {
      throw new functions.https.HttpsError('permission-denied', 'The purchase carries no transaction id.');
    }
  } else if (isAmazon) {
    const verification = await verifyAmazonReceipt(purchaseToken, userIdAmazon, productId);
    if (!verification.valid) {
      console.warn(`Invalid Amazon receipt from user ${userId}: ${verification.error}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid Amazon receipt');
    }
    storeTransactionId = String(purchaseToken);
  } else {
    const verification = await verifyGooglePlayPurchase(productId, purchaseToken);
    if (!verification.valid) {
      console.warn(`Invalid purchase token from user ${userId}: ${verification.error}`);
      throw new functions.https.HttpsError('permission-denied', 'Invalid purchase token');
    }
    storeTransactionId = String(purchaseToken);
  }

  // Only now is there something worth trusting. The duplicate check runs on the identifier the
  // store confirmed, never on one the caller supplied: a caller can send a valid receipt with any
  // transactionId it likes, and could otherwise pass someone else's receipt to have a second
  // account entitled from one purchase.
  const existing = await db.collection('purchases').where('storeTransactionId', '==', storeTransactionId).limit(1).get();
  if (!existing.empty) {
    const first = existing.docs[0];
    if (first.data().userId !== userId) {
      console.warn(`purchase ${storeTransactionId} already belongs to another account; refusing to entitle ${userId}`);
      throw new functions.https.HttpsError('permission-denied', 'That purchase is already on another account.');
    }
    return { success: true, purchaseId: first.id, duplicate: true };
  }

  // Record the purchase with platform-specific fields
  const purchaseRecord: Record<string, unknown> = {
    userId,
    productId,
    platform: isIOS ? 'ios' : isAmazon ? 'amazon' : 'android',
    status: 'validated',
    storeTransactionId,
    validatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(environment ? { environment } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (isIOS) {
    purchaseRecord.transactionReceipt = transactionReceipt;
    if (transactionId) purchaseRecord.transactionId = transactionId;
  } else {
    purchaseRecord.purchaseToken = purchaseToken;
    if (isAmazon) purchaseRecord.userIdAmazon = userIdAmazon;
  }

  const purchaseRef = await db.collection('purchases').add(purchaseRecord);

  // The Pit Wall Pass is the one product the device does not grant itself: the entitlement is a
  // custom auth claim the Firestore rules read, stamped from users/{uid}.pass by a trigger. The
  // grant is keyed on the purchase record, so a replayed receipt cannot extend a pass twice.
  if (productId === PASS_PRODUCT) {
    const pass = await grantPass(db, userId, currentSeason(Date.now()), isIOS ? 'apple' : isAmazon ? 'amazon' : 'play', purchaseRef.id);
    console.log(`[pw] pass granted from ${platform} for ${userId} until ${new Date(pass.expiresAt).toISOString()}`);
  }

  return { success: true, purchaseId: purchaseRef.id };
});

/**
 * Returns all purchases for the authenticated user, newest first.
 */
export const getUserPurchases = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'getUserPurchases');

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
