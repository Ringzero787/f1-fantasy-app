// Subscription webhooks — keep commissionerProActive accurate when subscriptions
// renew, expire, or are refunded server-side (without the user opening the app).
//
// These handlers are intentionally permissive in v1: signature verification is
// noted as a follow-up. Production should verify Apple's JWS signature against
// Apple's public keys (use the `app-store-server-library` package) and verify
// Google Pub/Sub message origin.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyEntitlement, deactivateCommissionerPro } from './applyEntitlement';

const db = admin.firestore();

// ---- Apple App Store Server Notifications V2 ----
// Apple POSTs a JSON payload with a JWS-signed `signedPayload` field. Decode it
// (base64url) without verifying signature in v1; verify in production.

interface AppleNotificationDecoded {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    bundleId?: string;
  };
}

interface AppleTransactionInfoDecoded {
  productId?: string;
  expiresDate?: number; // ms
  originalTransactionId?: string;
  transactionId?: string;
  type?: string;
  appAccountToken?: string;
}

function decodeJwsPayload<T>(jws: string): T | null {
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function userIdForOriginalTransactionId(originalTransactionId: string): Promise<string | null> {
  // We stored appleTransactionId on the tl_purchases doc when first validated.
  const snap = await db
    .collection('tl_purchases')
    .where('appleTransactionId', '==', originalTransactionId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return (snap.docs[0].data().userId as string) ?? null;
}

export const tlAppleSubscriptionWebhook = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const body = req.body as { signedPayload?: string };
    if (!body?.signedPayload) {
      console.warn('[tl/apple-webhook] No signedPayload');
      res.status(400).send('No signedPayload');
      return;
    }

    const payload = decodeJwsPayload<AppleNotificationDecoded>(body.signedPayload);
    if (!payload) {
      res.status(400).send('Bad payload');
      return;
    }

    const tx = payload.data?.signedTransactionInfo
      ? decodeJwsPayload<AppleTransactionInfoDecoded>(payload.data.signedTransactionInfo)
      : null;

    if (!tx?.productId || !tx?.originalTransactionId) {
      console.log('[tl/apple-webhook] notification with no transaction info', payload.notificationType);
      res.status(200).send('ok');
      return;
    }

    const userId = await userIdForOriginalTransactionId(tx.originalTransactionId);
    if (!userId) {
      console.warn(`[tl/apple-webhook] No user found for tx ${tx.originalTransactionId}`);
      res.status(200).send('ok'); // 200 to avoid Apple retrying forever
      return;
    }

    const expiresDate = tx.expiresDate ? new Date(tx.expiresDate) : undefined;

    // Notification types we care about
    switch (payload.notificationType) {
      case 'DID_RENEW':
      case 'SUBSCRIBED':
      case 'OFFER_REDEEMED':
      case 'DID_CHANGE_RENEWAL_STATUS':
        await applyEntitlement(userId, tx.productId, expiresDate);
        break;
      case 'EXPIRED':
      case 'REFUND':
      case 'REVOKE':
        await deactivateCommissionerPro(userId);
        break;
      case 'GRACE_PERIOD_EXPIRED':
        await deactivateCommissionerPro(userId);
        break;
      default:
        console.log(`[tl/apple-webhook] Unhandled type ${payload.notificationType}`);
    }

    // Audit trail
    await db.collection('tl_webhook_log').add({
      source: 'apple',
      type: payload.notificationType,
      subtype: payload.subtype,
      userId,
      productId: tx.productId,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send('ok');
  });

// ---- Google Real-time Developer Notifications (Pub/Sub) ----
// Google delivers notifications via a Pub/Sub topic. The handler receives the
// message via Pub/Sub trigger; payload is base64-encoded JSON.

interface GooglePubSubMessage {
  data: string;
  attributes?: Record<string, string>;
}

interface GoogleNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number; // 1=recovered, 2=renewed, 3=canceled, 4=purchased, 5=on_hold, 6=in_grace_period, 7=restarted, 8=price_change_confirmed, 9=deferred, 10=paused, 11=pause_schedule_changed, 12=revoked, 13=expired
    purchaseToken?: string;
    subscriptionId?: string;
  };
  oneTimeProductNotification?: {
    notificationType?: number; // 1=purchased, 2=canceled
    purchaseToken?: string;
    sku?: string;
  };
}

async function userIdForGooglePurchaseToken(purchaseToken: string): Promise<string | null> {
  const snap = await db
    .collection('tl_purchases')
    .where('purchaseToken', '==', purchaseToken)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return (snap.docs[0].data().userId as string) ?? null;
}

export const tlGoogleSubscriptionWebhook = functions
  .region('us-central1')
  .pubsub.topic('tl-google-rtdn')
  .onPublish(async (message) => {
    const m = message as unknown as GooglePubSubMessage;
    if (!m.data) return;

    const json = Buffer.from(m.data, 'base64').toString('utf-8');
    const notif: GoogleNotification = JSON.parse(json);

    if (notif.subscriptionNotification?.purchaseToken && notif.subscriptionNotification.subscriptionId) {
      const userId = await userIdForGooglePurchaseToken(notif.subscriptionNotification.purchaseToken);
      if (!userId) {
        console.warn('[tl/google-webhook] No user for token');
        return;
      }
      const productId = notif.subscriptionNotification.subscriptionId;
      const type = notif.subscriptionNotification.notificationType;
      // 2=renewed, 4=purchased, 7=restarted → activate
      // 3=canceled, 12=revoked, 13=expired, 5=on_hold → deactivate
      if ([2, 4, 7].includes(type ?? 0)) {
        await applyEntitlement(userId, productId);
      } else if ([3, 5, 12, 13].includes(type ?? 0)) {
        await deactivateCommissionerPro(userId);
      }
      await db.collection('tl_webhook_log').add({
        source: 'google',
        type: 'subscription',
        notificationType: type,
        userId,
        productId,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // (One-time product notifications are also handled at validate time;
    // duplicate handling here would need similar idempotent logic.)
  });
