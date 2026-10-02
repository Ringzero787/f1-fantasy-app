/**
 * Deciding whether a purchase has been refunded (F-085).
 *
 * Kept pure and away from the network, because the dangerous mistake here is not missing a refund —
 * it is revoking a pass somebody still owns. A store that times out, a token that cannot be read, a
 * response shaped differently than expected: none of those are refunds, and all of them would look
 * like one to code that treats "not clearly active" as cancelled.
 *
 * So there are three answers and only one of them takes anything away.
 */

/** `refunded` is the only verdict that revokes. `unknown` is the safe answer and the common one. */
export type RefundVerdict = 'active' | 'refunded' | 'unknown';

/**
 * Google Play, from `purchases.products.get`.
 *
 * `purchaseState`: 0 purchased, 1 cancelled, 2 pending. Only 1 is a refund. A pending purchase is
 * not refunded and not yet a sale, and a document with no state at all is a shape we do not
 * recognise rather than a cancellation.
 */
export function playVerdict(data: Record<string, unknown> | null | undefined): RefundVerdict {
  if (!data || typeof data !== 'object') return 'unknown';
  const state = data.purchaseState;
  if (state === 1) return 'refunded';
  if (state === 0 || state === 2) return 'active';
  return 'unknown';
}

/**
 * Amazon, from the Receipt Verification Service.
 *
 * `cancelDate` is set when a purchase was refunded or revoked, and null otherwise. Amazon sends it
 * as a timestamp in milliseconds, so zero is "not cancelled" rather than "cancelled at the epoch".
 */
export function amazonVerdict(data: Record<string, unknown> | null | undefined): RefundVerdict {
  if (!data || typeof data !== 'object') return 'unknown';
  if (!('cancelDate' in data)) return 'unknown';
  const cancel = data.cancelDate;
  if (cancel === null || cancel === undefined || cancel === 0) return 'active';
  return typeof cancel === 'number' || typeof cancel === 'string' ? 'refunded' : 'unknown';
}

/**
 * Apple, from the legacy `verifyReceipt` endpoint.
 *
 * `cancellation_date_ms` appears on the in-app entry once Apple has refunded it. Only the entry for
 * the product in question matters: a refund of some other purchase in the same receipt says nothing
 * about this pass.
 *
 * This covers the legacy receipt path only. A StoreKit 2 signed transaction is a fixed artefact —
 * re-verifying the copy we stored returns exactly what it returned the first time, refund or not —
 * so a refunded StoreKit 2 purchase cannot be found this way at all. That needs App Store Server
 * Notifications or the App Store Server API, and is out of scope here rather than quietly assumed.
 */
export function appleLegacyVerdict(data: Record<string, unknown> | null | undefined, productId: string): RefundVerdict {
  if (!data || typeof data !== 'object') return 'unknown';
  if (data.status !== 0) return 'unknown';
  const receipt = data.receipt as Record<string, unknown> | undefined;
  const inApp = Array.isArray(receipt?.in_app) ? (receipt!.in_app as Record<string, unknown>[]) : null;
  if (!inApp) return 'unknown';
  const mine = inApp.filter((e) => e && e.product_id === productId);
  if (!mine.length) return 'unknown';
  // Any entry for this product carrying a cancellation is enough; a buyer with two of them who had
  // one refunded still paid for the other, but a season pass is not stackable, so treat it as gone.
  return mine.some((e) => e.cancellation_date_ms != null || e.cancellation_date != null) ? 'refunded' : 'active';
}

/** Whether a stored purchase can be re-checked at all, which is not the same as whether it is active. */
export function checkable(platform: string, hasJwsReceipt: boolean): boolean {
  if (platform === 'android' || platform === 'amazon') return true;
  // iOS only when it is a legacy receipt; a signed transaction tells us nothing new.
  return platform === 'ios' && !hasJwsReceipt;
}

/** A StoreKit 2 receipt is a three-part JWS; the legacy one is base64 with no dots. */
export const isJws = (receipt: unknown): boolean =>
  typeof receipt === 'string' && receipt.split('.').length === 3;
