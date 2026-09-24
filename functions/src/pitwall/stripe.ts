/**
 * Stripe web checkout for the Pit Wall Pass (F-068).
 *
 * Why Stripe as well as store IAP: the portal is a website, and neither Apple nor Google billing
 * can be started from one; Amazon devices have no usable IAP at all. The same pass is sold in the
 * apps through the store (F-060) and every path ends at grantPass, so an entitlement bought
 * anywhere works everywhere.
 *
 * Card data never reaches us: Checkout is hosted by Stripe. We keep the customer id and the pass.
 * The webhook is verified with the signing secret and is idempotent on the Stripe event id.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export const CHECKOUT_MODE = 'payment' as const;
export const CURRENCY = 'usd';
/** Stripe works in the smallest unit: $14.99 is 1499 cents. */
export const PASS_AMOUNT_CENTS = 1499;
/** Signatures older than this are refused, so a captured request cannot be replayed later. */
export const SIGNATURE_TOLERANCE_SEC = 300;

export interface StripeVerified { ok: true; event: Record<string, unknown> }
export interface StripeRejected { ok: false; reason: 'no-signature' | 'malformed' | 'stale' | 'bad-signature' | 'bad-json' }

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature` header) against the raw body.
 * Implemented here rather than with the SDK so it is pure and unit-testable, and so the function
 * keeps no runtime dependency for a few lines of HMAC.
 */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, nowSec: number): StripeVerified | StripeRejected {
  if (!header) return { ok: false, reason: 'no-signature' };
  const parts = new Map<string, string[]>();
  for (const piece of header.split(',')) {
    const [k, v] = piece.split('=');
    if (!k || !v) continue;
    const list = parts.get(k.trim()) ?? [];
    list.push(v.trim());
    parts.set(k.trim(), list);
  }
  const t = parts.get('t')?.[0];
  const signatures = parts.get('v1') ?? [];
  if (!t || signatures.length === 0 || !/^\d+$/.test(t)) return { ok: false, reason: 'malformed' };
  if (Math.abs(nowSec - Number(t)) > SIGNATURE_TOLERANCE_SEC) return { ok: false, reason: 'stale' };
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const match = signatures.some((s) => {
    const given = Buffer.from(s, 'utf8');
    return given.length === expectedBuf.length && timingSafeEqual(given, expectedBuf);
  });
  if (!match) return { ok: false, reason: 'bad-signature' };
  try {
    return { ok: true, event: JSON.parse(rawBody) as Record<string, unknown> };
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
}

export interface CheckoutIntent { uid: string; season: string; email?: string | null }

/** The Checkout Session body. Client reference and metadata carry the uid, so the webhook knows who paid. */
export function checkoutSessionParams(i: CheckoutIntent, successUrl: string, cancelUrl: string): Record<string, string> {
  return {
    mode: CHECKOUT_MODE,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': CURRENCY,
    'line_items[0][price_data][unit_amount]': String(PASS_AMOUNT_CENTS),
    'line_items[0][price_data][product_data][name]': `Undercut Pit Wall Pass ${i.season}`,
    'line_items[0][price_data][product_data][description]': `Full Pit Wall portal and League Pro for the ${i.season} season.`,
    client_reference_id: i.uid,
    'metadata[uid]': i.uid,
    'metadata[season]': i.season,
    'metadata[product]': 'pitwall.pass.season',
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...(i.email ? { customer_email: i.email } : {}),
    'automatic_tax[enabled]': 'true',
  };
}

export type WebhookAction =
  | { kind: 'grant'; uid: string; season: string; ref: string }
  | { kind: 'revoke'; uid: string; reason: string }
  | { kind: 'ignore'; why: string };

/** What a verified Stripe event should do. Only paid checkouts grant; refunds and disputes revoke. */
export function webhookAction(event: Record<string, any>): WebhookAction {
  const type = String(event?.type ?? '');
  const object = event?.data?.object ?? {};
  const uid = String(object?.metadata?.uid ?? object?.client_reference_id ?? '');
  const season = String(object?.metadata?.season ?? '');
  const id = String(event?.id ?? '');
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (object?.payment_status !== 'paid') return { kind: 'ignore', why: `payment_status ${object?.payment_status}` };
    if (!uid || !season) return { kind: 'ignore', why: 'no uid or season in metadata' };
    if (!id) return { kind: 'ignore', why: 'no event id' };
    return { kind: 'grant', uid, season, ref: id };
  }
  if (type === 'charge.refunded' || type === 'charge.dispute.created') {
    const refundUid = String(object?.metadata?.uid ?? '');
    if (!refundUid) return { kind: 'ignore', why: 'refund without a uid' };
    return { kind: 'revoke', uid: refundUid, reason: type };
  }
  return { kind: 'ignore', why: `unhandled type ${type || '(none)'}` };
}
