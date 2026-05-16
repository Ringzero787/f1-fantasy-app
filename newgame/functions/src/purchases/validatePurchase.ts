import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { GoogleAuth } from 'google-auth-library';
import { applyEntitlement } from './applyEntitlement';

const db = admin.firestore();

const APPLE_SHARED_SECRET = defineSecret('APPLE_SHARED_SECRET');
const ANDROID_PACKAGE_NAME = 'com.tracklimits.app';

// Subscription product IDs — these go through the subscription verification path.
const SUBSCRIPTION_PRODUCT_IDS = new Set([
  'tl.commissioner_pro.monthly',
  'tl.commissioner_pro.yearly',
]);

// ---- Apple ----

interface AppleVerificationResult {
  valid: boolean;
  transactionId?: string;
  expirationDate?: Date;
  error?: string;
}

async function verifyAppleReceipt(
  receiptData: string,
  productId: string,
  sharedSecret: string
): Promise<AppleVerificationResult> {
  const payload = JSON.stringify({
    'receipt-data': receiptData,
    password: sharedSecret,
    'exclude-old-transactions': true,
  });

  async function postToApple(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    return res.json() as Promise<Record<string, unknown>>;
  }

  try {
    let result = await postToApple('https://buy.itunes.apple.com/verifyReceipt');
    if (result.status === 21007) {
      result = await postToApple('https://sandbox.itunes.apple.com/verifyReceipt');
    }
    if (result.status !== 0) {
      return { valid: false, error: `Apple status ${result.status}` };
    }

    // Subscriptions: latest_receipt_info contains all renewals — find the most recent for productId
    const isSubscription = SUBSCRIPTION_PRODUCT_IDS.has(productId);
    if (isSubscription) {
      const latest = (result.latest_receipt_info as Array<Record<string, unknown>>) || [];
      const matches = latest.filter((it) => it.product_id === productId);
      if (matches.length === 0) {
        return { valid: false, error: `Subscription ${productId} not found in latest_receipt_info` };
      }
      // Pick the latest by expires_date_ms
      matches.sort((a, b) => Number(b.expires_date_ms) - Number(a.expires_date_ms));
      const m = matches[0];
      const expirationDate = new Date(Number(m.expires_date_ms));
      if (expirationDate.getTime() < Date.now()) {
        return { valid: false, error: 'Subscription already expired' };
      }
      return { valid: true, transactionId: m.transaction_id as string, expirationDate };
    }

    // Non-subscription
    const inApp = (result.receipt as Record<string, unknown>)?.in_app as Array<Record<string, unknown>> | undefined;
    const match = inApp?.find((item) => item.product_id === productId);
    if (!match) return { valid: false, error: `Product ${productId} not in receipt` };
    return { valid: true, transactionId: match.transaction_id as string };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Google ----

interface GoogleVerificationResult {
  valid: boolean;
  expirationDate?: Date;
  error?: string;
}

async function verifyGoogleProduct(productId: string, purchaseToken: string): Promise<GoogleVerificationResult> {
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
    const client = await auth.getClient();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}`;
    const res = await client.request({ url });
    const data = res.data as Record<string, unknown>;
    if (data.purchaseState !== 0) {
      return { valid: false, error: `Purchase state ${data.purchaseState}` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function verifyGoogleSubscription(productId: string, purchaseToken: string): Promise<GoogleVerificationResult> {
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
    const client = await auth.getClient();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
    const res = await client.request({ url });
    const data = res.data as Record<string, unknown>;
    const expiryMillis = Number(data.expiryTimeMillis);
    if (!Number.isFinite(expiryMillis)) {
      return { valid: false, error: 'No expiryTimeMillis' };
    }
    if (expiryMillis < Date.now()) {
      return { valid: false, error: 'Subscription already expired' };
    }
    // paymentState: 1 = received, 2 = free trial, 3 = pending deferred upgrade/downgrade
    if (data.paymentState !== 1 && data.paymentState !== 2) {
      return { valid: false, error: `Payment state ${data.paymentState}` };
    }
    return { valid: true, expirationDate: new Date(expiryMillis) };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Callable ----

export const tlValidatePurchase = functions
  .region('us-central1')
  .runWith({ secrets: [APPLE_SHARED_SECRET] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { productId, purchaseToken, transactionReceipt, transactionId, platform } = data as {
      productId: string;
      purchaseToken?: string;
      transactionReceipt?: string;
      transactionId?: string;
      platform: 'ios' | 'android';
    };

    if (!productId) {
      throw new functions.https.HttpsError('invalid-argument', 'productId required');
    }

    const isIOS = platform === 'ios';
    const userId = context.auth.uid;

    // Idempotency check — same (transactionId | purchaseToken) shouldn't double-grant
    const purchasesCol = db.collection('tl_purchases');
    if (isIOS && transactionId) {
      const dupe = await purchasesCol.where('transactionId', '==', transactionId).limit(1).get();
      if (!dupe.empty) {
        return { success: true, duplicate: true, purchaseId: dupe.docs[0].id };
      }
    } else if (!isIOS && purchaseToken) {
      const dupe = await purchasesCol.where('purchaseToken', '==', purchaseToken).limit(1).get();
      if (!dupe.empty) {
        return { success: true, duplicate: true, purchaseId: dupe.docs[0].id };
      }
    }

    const isSubscription = SUBSCRIPTION_PRODUCT_IDS.has(productId);
    let verification: AppleVerificationResult | GoogleVerificationResult;

    if (isIOS) {
      if (!transactionReceipt) {
        throw new functions.https.HttpsError('invalid-argument', 'transactionReceipt required for iOS');
      }
      const sharedSecret = APPLE_SHARED_SECRET.value();
      if (!sharedSecret) {
        throw new functions.https.HttpsError('failed-precondition', 'APPLE_SHARED_SECRET not configured');
      }
      verification = await verifyAppleReceipt(transactionReceipt, productId, sharedSecret);
    } else {
      if (!purchaseToken) {
        throw new functions.https.HttpsError('invalid-argument', 'purchaseToken required for Android');
      }
      verification = isSubscription
        ? await verifyGoogleSubscription(productId, purchaseToken)
        : await verifyGoogleProduct(productId, purchaseToken);
    }

    if (!verification.valid) {
      console.warn(`[tl] Invalid purchase from ${userId} for ${productId}: ${verification.error}`);
      throw new functions.https.HttpsError('permission-denied', `Invalid purchase: ${verification.error}`);
    }

    // Apply entitlement
    const result = await applyEntitlement(userId, productId, verification.expirationDate);

    // Persist the purchase record
    const record: Record<string, unknown> = {
      userId,
      productId,
      platform: isIOS ? 'ios' : 'android',
      isSubscription,
      status: result.applied ? 'verified' : 'verified_but_not_applied',
      validatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (isIOS) {
      record.transactionReceipt = transactionReceipt;
      if (transactionId) record.transactionId = transactionId;
      if ('transactionId' in verification && verification.transactionId) {
        record.appleTransactionId = verification.transactionId;
      }
    } else {
      record.purchaseToken = purchaseToken;
    }
    if (verification.expirationDate) {
      record.expirationDate = verification.expirationDate;
    }

    const docRef = await purchasesCol.add(record);
    return {
      success: true,
      duplicate: false,
      purchaseId: docRef.id,
      applied: result.applied,
      reason: result.reason,
      expirationDate: verification.expirationDate?.toISOString(),
    };
  });
