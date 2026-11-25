/**
 * Take the pass back when the store gives the money back (F-085).
 *
 * Every store's refund signal was read exactly once, at the moment of purchase, and never again. So
 * a buyer could take the pass, refund it, and keep access until the season ended in January. Stripe
 * was the only route wired for revocation, through its webhook.
 *
 * This is a sweep rather than a webhook on purpose. Push notifications from three stores mean three
 * consoles configured, a Pub/Sub topic, and an endpoint per store, each of which can be
 * misconfigured silently — and we have just spent a day on a permission that was granted to the
 * wrong account and looked right in the console. A scheduled re-check needs none of that and fails
 * visibly. A season pass can tolerate a day's latency; it cannot tolerate a revocation path nobody
 * can tell is broken.
 *
 * The one store this cannot re-check is StoreKit 2 (refundCheck.checkable): Apple's re-check needs an
 * In-App Purchase key. Those refunds arrive as App Store Server Notifications instead
 * (appleNotifications.ts, F-175 slice 5), and both paths take back through refundApply.ts.
 *
 * It only ever takes a pass away on a definite refund. Everything else — a store that times out, a
 * shape we do not recognise, a purchase we cannot re-check at all — leaves the pass alone and says
 * so in the log. See refundCheck.ts.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { defineSecret } from 'firebase-functions/params';
import { PASS_PRODUCT } from './pass';
import { refundPurchase } from './refundApply';
import { CHARTER_PRODUCT } from '../charter/charter';
import { SLOT_PACK_CHARTER_PRODUCT, SLOT_PACK_PRODUCT } from '../purchases/slotPack';
import { amazonVerdict, appleLegacyVerdict, checkable, isJws, playVerdict, type RefundVerdict } from './refundCheck';

const db = admin.firestore();
const amazonSharedSecret = defineSecret('AMAZON_SHARED_SECRET');
const appleSharedSecret = defineSecret('APPLE_SHARED_SECRET');

const PLAY_PACKAGE = 'com.undercut.app';

/**
 * Never log a throwable whole. The Amazon shared secret rides in that request's URL path, and an
 * error object carrying the URL would put it in Cloud Logging.
 */
const msg = (err: unknown): string => (err instanceof Error ? err.message : 'unknown error');
/** A store that will not answer in this long is not going to, and the sweep runs again tomorrow. */
const TIMEOUT_MS = 15000;

async function playState(productId: string, token: string): Promise<RefundVerdict> {
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
    const client = await auth.getClient();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
    const res = await client.request({ url, timeout: TIMEOUT_MS });
    const data = res.data as Record<string, unknown>;
    // Play echoes the product it matched. This is the one place a wrong answer revokes rather than
    // denies, so an answer about something else is not an answer.
    if (typeof data?.productId === 'string' && data.productId !== productId) return 'unknown';
    return playVerdict(data);
  } catch (err) {
    // A 404 from Play means the token is gone, which is not the same as refunded and is not worth
    // guessing about. Everything here is unknown.
    console.warn('[refunds] play re-check failed:', msg(err));
    return 'unknown';
  }
}

async function amazonState(receiptId: string, userIdAmazon: string, productId: string): Promise<RefundVerdict> {
  const secret = amazonSharedSecret.value();
  if (!secret) return 'unknown';
  try {
    const url = `https://appstore-sdk.amazon.com/version/1.0/verifyReceiptId/developer/${encodeURIComponent(secret)}/user/${encodeURIComponent(userIdAmazon)}/receiptId/${encodeURIComponent(receiptId)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return 'unknown';
    const data = (await res.json()) as Record<string, unknown>;
    return data.productId === productId ? amazonVerdict(data) : 'unknown';
  } catch (err) {
    console.warn('[refunds] amazon re-check failed:', msg(err));
    return 'unknown';
  }
}

async function appleLegacyState(receipt: string, productId: string): Promise<RefundVerdict> {
  const secret = appleSharedSecret.value();
  if (!secret) return 'unknown';
  const body = JSON.stringify({ 'receipt-data': receipt, password: secret });
  const post = async (url: string) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return (await res.json()) as Record<string, unknown>;
  };
  try {
    let data = await post('https://buy.itunes.apple.com/verifyReceipt');
    if (data.status === 21007) data = await post('https://sandbox.itunes.apple.com/verifyReceipt');
    return appleLegacyVerdict(data, productId);
  } catch (err) {
    console.warn('[refunds] apple re-check failed:', msg(err));
    return 'unknown';
  }
}

/** Re-check one stored purchase. Exported so a support script can run it for a single account. */
export async function verdictFor(purchase: Record<string, unknown>): Promise<RefundVerdict> {
  const platform = String(purchase.platform ?? '');
  const productId = String(purchase.productId ?? '');
  const token = typeof purchase.purchaseToken === 'string' ? purchase.purchaseToken : '';
  const receipt = typeof purchase.transactionReceipt === 'string' ? purchase.transactionReceipt : '';
  if (!checkable(platform, isJws(receipt))) return 'unknown';
  if (platform === 'android') return token ? playState(productId, token) : 'unknown';
  if (platform === 'amazon') {
    const user = typeof purchase.userIdAmazon === 'string' ? purchase.userIdAmazon : '';
    return token && user ? amazonState(token, user, productId) : 'unknown';
  }
  return receipt ? appleLegacyState(receipt, productId) : 'unknown';
}

/**
 * Daily. Every validated pass purchase is asked about again, and a refunded one loses its pass.
 *
 * Deliberately not clever about which to check: the number of pass holders is small enough that
 * checking all of them is cheaper than maintaining a cursor that could silently skip someone.
 */
export const sweepRefundedPasses = functions
  .runWith({ secrets: [amazonSharedSecret, appleSharedSecret], timeoutSeconds: 540 })
  .pubsub.schedule('every 24 hours')
  .onRun(async () => {
    const snap = await db.collection('purchases')
      .where('productId', '==', PASS_PRODUCT)
      .where('status', '==', 'validated')
      .get();
    // F-175: charter purchases too, with the same index. A refunded charter clears that league's
    // charter and its members' access, and never touches anyone's pass.
    const charters = await db.collection('purchases')
      .where('productId', '==', CHARTER_PRODUCT)
      .where('status', '==', 'validated')
      .get();

    // Slot packs (owner decision 2026-11-25): an applied pack that the store refunded takes its slots
    // back out of `paidSlots`, so a charter no longer covers them (charterCap). maxMembers is left as
    // it is: approved players are not removed, and an ordinary league's size is free anyway.
    // Its own try: a failed query here must not stop the pass and charter refunds below.
    const packs = await db.collection('purchases').where('status', '==', 'applied').where('productId', 'in', [SLOT_PACK_PRODUCT, SLOT_PACK_CHARTER_PRODUCT]).get()
      .catch((err) => { console.error('[refunds] slot pack query failed:', msg(err)); return { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }; });

    let checked = 0, revoked = 0, skipped = 0, stale = 0, failed = 0, uncharted = 0, unslotted = 0;
    // Each purchase is handled on its own: one bad document must not end the sweep, the rest of
    // the refunds still need finding. What a refund takes back lives in refundApply.ts.
    for (const doc of [...packs.docs, ...charters.docs, ...snap.docs]) {
      try {
        const purchase = doc.data();
        const verdict = await verdictFor(purchase);
        if (verdict === 'unknown') { skipped += 1; continue; }
        checked += 1;
        if (verdict !== 'refunded') continue;
        const outcome = await refundPurchase(db, doc.ref, purchase, `store refund · ${purchase.platform}`);
        if (outcome === 'revoked') revoked += 1;
        else if (outcome === 'superseded') stale += 1;
        else if (outcome === 'uncharted') uncharted += 1;
        else if (outcome === 'unslotted') unslotted += 1;
        else if (outcome === 'no-user') failed += 1;
      } catch (err) {
        failed += 1;
        console.error(`[refunds] ${doc.id} could not be processed:`, msg(err));
      }
    }

    const line = `[refunds] ${snap.size} pass + ${charters.size} charter purchases · ${checked} re-checked · ${revoked} revoked · ${uncharted} charters cleared · ${unslotted} slot packs taken back · ${stale} superseded · ${skipped} not checkable · ${failed} failed`;
    if (failed) console.error(line); else console.log(line);
    return null;
  });
