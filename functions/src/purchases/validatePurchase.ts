import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { defineSecret } from 'firebase-functions/params';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { verifyAppleTransaction } from './appleTransaction';
import { PASS_PRODUCT, currentSeason } from '../pitwall/pass';
import { grantPass } from '../pitwall/passStore';
import { isAmazonReceiptId, isAmazonUserId, isKnownProduct, isPlayToken } from './productGuards';
import { createHash } from 'crypto';

const db = admin.firestore();

/**
 * Amazon's receipt verification service needs the developer account's shared secret.
 *
 * It lived in `functions.config()`, which Firebase retires in March 2027 and whose CLI commands are
 * already gated behind an opt-in experiment. This is the pattern the rest of this codebase already
 * uses — see signInWithAmazon, which holds the other two Amazon credentials the same way.
 *
 * The landmine the old choice was avoiding is real but narrower than it looked: Firebase resolves
 * every declared secret before it filters a deploy by target, so a secret declared here with no
 * value in Secret Manager blocks EVERY functions deploy on the project, not just this one. Set the
 * value first, then deploy:
 *
 *   firebase functions:secrets:set AMAZON_SHARED_SECRET --project f1-app-18077
 */
const amazonSharedSecret = defineSecret('AMAZON_SHARED_SECRET');

/**
 * Apple's legacy verifyReceipt endpoint needs the app's shared secret. StoreKit 2, which every
 * build from 2.4.0 uses, sends a signed transaction that is verified against Apple's root instead
 * and needs no secret at all — but an older build still reaches verifyAppleReceipt, and that path
 * was reading the same retired config as Amazon's. With config empty it answered "not configured"
 * every time, so the fallback could never have worked. APPLE_SHARED_SECRET was already in Secret
 * Manager; only the code was still looking in the old place.
 */
const appleSharedSecret = defineSecret('APPLE_SHARED_SECRET');

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
): Promise<{ valid: boolean; transactionId?: string; environment?: string | null; error?: string }> {
  const sharedSecret = appleSharedSecret.value();
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

    // The receipt says which app it belongs to, and this endpoint will happily verify a receipt
    // from any app sharing the secret. verifyAppleTransaction checks this on the StoreKit 2 path;
    // this one never did, because it could never run at all.
    const receipt = result.receipt as Record<string, unknown> | undefined;
    if (receipt?.bundle_id !== IOS_BUNDLE_ID) {
      return { valid: false, error: `Receipt is for ${String(receipt?.bundle_id)}, not ${IOS_BUNDLE_ID}` };
    }

    const inApp = (receipt?.in_app as Array<Record<string, unknown>>) || [];
    const match = inApp.find((item) => item.product_id === productId);

    if (!match) {
      return { valid: false, error: `Product ${productId} not found in receipt` };
    }

    // Carried so a pass granted from a sandbox purchase can be found and revoked later, which is
    // the whole point of recording it on the StoreKit 2 path.
    const env = typeof result.environment === 'string' ? result.environment : null;
    return { valid: true, transactionId: match.transaction_id as string, environment: env };
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
    // Encoded, and both segments already checked by the caller: see isPlayToken and isKnownProduct.
    // Belt and braces, because the cost of a path escaping here is a free season pass.
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const response = await client.request({ url });
    const data = response.data as Record<string, unknown>;

    // Play echoes the product it actually matched. If that is not the one we asked about, the
    // request did not mean what we thought it meant and nothing here is safe to trust.
    const answered = typeof data.productId === 'string' ? data.productId : null;
    if (answered !== null && answered !== productId) {
      return { valid: false, error: `Play answered for ${answered}, not ${productId}` };
    }

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
 * and is only available from the purchase itself.
 *
 * The secret is a declared secret, set with `firebase functions:secrets:set AMAZON_SHARED_SECRET`.
 * Rotate it there and redeploy; putting a new value in the old function config would leave this
 * reading the stale one and deny every Amazon purchase. Set the value before deploying a change
 * that declares it, because firebase resolves every declared secret before it filters a deploy by
 * target, so one missing value blocks every functions deploy on the project.
 */
async function verifyAmazonReceipt(
  receiptId: string,
  amazonUserId: string,
  productId: string
): Promise<{ valid: boolean; environment?: string | null; error?: string }> {
  const sharedSecret = amazonSharedSecret.value();
  if (!sharedSecret) return { valid: false, error: 'Amazon shared secret not configured' };
  try {
    const url = `https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId/developer/${encodeURIComponent(sharedSecret)}/user/${encodeURIComponent(amazonUserId)}/receiptId/${encodeURIComponent(receiptId)}`;
    // Bounded: a store that never answers must not hold a paying customer on a spinner.
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { valid: false, error: `Amazon RVS returned ${response.status}` };
    const data = (await response.json()) as Record<string, unknown>;
    if (data.productId !== productId) return { valid: false, error: `Receipt is for ${String(data.productId)}, not ${productId}` };
    // The receipt we get back must be the one we asked about.
    if (typeof data.receiptId === 'string' && data.receiptId !== receiptId) {
      return { valid: false, error: 'Amazon answered about a different receipt' };
    }
    // cancelDate is set when a purchase was refunded or revoked.
    if (data.cancelDate) return { valid: false, error: 'Purchase was cancelled' };
    // A Live App Testing purchase goes through the production endpoint and verifies like any other,
    // and it costs nothing. Accepted, because that is how Amazon expects the store to be tested, but
    // recorded: without this an invited tester's pass is byte-identical to a $14.99 sale and cannot
    // be found and revoked. Apple's path has done this bookkeeping all along; Amazon was the odd
    // one out.
    const isTest = data.testTransaction === true || data.betaProduct === true;
    return { valid: true, environment: isTest ? 'Sandbox' : 'Production' };
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
export const validatePurchase = functions.runWith({ secrets: [amazonSharedSecret, appleSharedSecret] }).https.onCall(async (data, context) => {
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

  if (!isKnownProduct(productId)) {
    throw new functions.https.HttpsError('invalid-argument', 'productId is not a product this app sells');
  }

  if (isIOS && !transactionReceipt) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'transactionReceipt is required for iOS purchases'
    );
  }

  // Each store's identifier gets its own shape. Play's is checked tightly because it becomes a path
  // segment of the URL we ask Play about; Amazon's is base64 and would fail that check outright.
  if (!isIOS && !(isAmazon ? isAmazonReceiptId(purchaseToken) : isPlayToken(purchaseToken))) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `purchaseToken is required for ${isAmazon ? 'Amazon' : 'Android'} purchases and must be a store identifier`
    );
  }

  if (isAmazon && !isAmazonUserId(userIdAmazon)) {
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
      // Legacy receipt path: verifyAppleReceipt returns the transaction id it found in the receipt,
      // and now the environment with it, so a sandbox purchase through this path is marked the same
      // way as one through StoreKit 2 rather than being indistinguishable from a sale.
      if (verification.environment) environment = verification.environment;
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
    if (verification.environment) environment = verification.environment;
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
  // The document id IS the duplicate check. A read-then-write let two accounts send the same token
  // at once, both see nothing, and both be entitled — the dedupe below was doing the right
  // comparison on the wrong primitive. `create` fails if the id exists, and Firestore decides the
  // winner, so one store transaction can only ever produce one purchase record.
  const purchaseId = createHash('sha256').update(`${isIOS ? 'ios' : isAmazon ? 'amazon' : 'android'}:${storeTransactionId}`).digest('hex').slice(0, 40);
  const purchaseDoc = db.collection('purchases').doc(purchaseId);

  const claimedBy = async (): Promise<string | null> => {
    const byId = await purchaseDoc.get();
    if (byId.exists) return (byId.data()?.userId as string) ?? null;
    // Records written before the id became deterministic carry a random one, so the field query has
    // to stay: without it, every purchase that predates this deploy silently stops participating in
    // duplicate detection and becomes replayable, including onto another account. The collection is
    // empty today, but purchases are live on both stores while this ships, so the gap is real.
    const byField = await db.collection('purchases').where('storeTransactionId', '==', storeTransactionId).limit(1).get();
    return byField.empty ? null : ((byField.docs[0].data().userId as string) ?? null);
  };

  const owner = await claimedBy();
  if (owner !== null) {
    if (owner !== userId) {
      console.warn(`purchase already belongs to another account; refusing to entitle ${userId}`);
      throw new functions.https.HttpsError('permission-denied', 'That purchase is already on another account.');
    }
    return { success: true, purchaseId, duplicate: true };
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

  try {
    await purchaseDoc.create(purchaseRecord);
  } catch (err: unknown) {
    // Only an id collision means someone else won the race. Anything else is Firestore having a bad
    // moment, and telling a buyer who has just paid that their purchase belongs to someone else is
    // the worst possible way to report a transient write failure.
    const code = (err as { code?: number | string } | null)?.code;
    if (code !== 6 && code !== 'already-exists') {
      console.error('purchase write failed:', err instanceof Error ? err.message : err);
      throw new functions.https.HttpsError('internal', 'Could not record the purchase. Please try again.');
    }
    const owner = await claimedBy();
    if (owner === userId) return { success: true, purchaseId, duplicate: true };
    console.warn(`purchase lost a race to another account; refusing to entitle ${userId}`);
    throw new functions.https.HttpsError('permission-denied', 'That purchase is already on another account.');
  }
  const purchaseRef = purchaseDoc;

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
