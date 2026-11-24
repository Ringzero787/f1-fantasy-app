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
export const PASS_PRODUCT_ID = 'pitwall.pass.season';
/** Charter (F-175): $39.99, one league, one season. */
export const CHARTER_PRODUCT_ID = 'pitwall.charter.season';
export const CHARTER_AMOUNT_CENTS = 3999;
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

export interface CheckoutIntent {
  uid: string;
  season: string;
  email?: string | null;
  /** defaults to the pass, which is what every checkout was before Charter */
  product?: typeof PASS_PRODUCT_ID | typeof CHARTER_PRODUCT_ID;
  /** required for a charter: the league being chartered */
  leagueId?: string;
}

/**
 * The Checkout Session body. Client reference and metadata carry the uid, so the webhook knows who paid.
 *
 * The same metadata is put on the PaymentIntent (`payment_intent_data[metadata]`), because Stripe
 * does not copy Checkout Session metadata to it, and a refund or dispute event is about the charge,
 * which carries only the PaymentIntent's. Without it a refund arrives with no uid, product or league.
 */
export function checkoutSessionParams(i: CheckoutIntent, successUrl: string, cancelUrl: string): Record<string, string> {
  const charter = i.product === CHARTER_PRODUCT_ID;
  if (charter && !i.leagueId) throw new Error('a charter checkout needs a leagueId');
  const meta: Record<string, string> = {
    uid: i.uid,
    season: i.season,
    product: charter ? CHARTER_PRODUCT_ID : PASS_PRODUCT_ID,
    ...(charter ? { leagueId: i.leagueId as string } : {}),
  };
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    metadata[`metadata[${k}]`] = v;
    metadata[`payment_intent_data[metadata][${k}]`] = v;
  }
  return {
    mode: CHECKOUT_MODE,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': CURRENCY,
    'line_items[0][price_data][unit_amount]': String(charter ? CHARTER_AMOUNT_CENTS : PASS_AMOUNT_CENTS),
    'line_items[0][price_data][product_data][name]': charter ? `Undercut Charter ${i.season}` : `Undercut Pit Wall Pass ${i.season}`,
    'line_items[0][price_data][product_data][description]': charter
      ? 'Pit Wall for every player in one league, for the season.'
      : `Full Pit Wall portal and League Pro for the ${i.season} season.`,
    client_reference_id: i.uid,
    ...metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...(i.email ? { customer_email: i.email } : {}),
    'automatic_tax[enabled]': 'true',
  };
}

export type WebhookAction =
  | { kind: 'grant'; uid: string; season: string; ref: string }
  | { kind: 'revoke'; uid: string; reason: string }
  /** F-175: charter one league. `ref` is `stripe:{payment_intent}`, which the refund carries too. */
  | { kind: 'charter'; uid: string; season: string; leagueId: string; ref: string }
  /** F-175: take back the charter this payment bought, on its league only. Never revokes a pass. */
  /** leagueId null: look it up from charter_grants/{ref} (a dispute carries no metadata) */
  | { kind: 'uncharter'; leagueId: string | null; ref: string; reason: string }
  | { kind: 'ignore'; why: string };

/** The charter reference for a payment: the PaymentIntent id, present on the session and on its charge. */
const charterRef = (paymentIntent: unknown): string | null => {
  const pi = typeof paymentIntent === 'string' ? paymentIntent : typeof (paymentIntent as { id?: unknown })?.id === 'string' ? (paymentIntent as { id: string }).id : '';
  return pi ? `stripe:${pi}` : null;
};

/** What a verified Stripe event should do. Only paid checkouts grant; refunds and disputes revoke. */
export function webhookAction(event: Record<string, any>): WebhookAction {
  const type = String(event?.type ?? '');
  const object = event?.data?.object ?? {};
  const uid = String(object?.metadata?.uid ?? object?.client_reference_id ?? '');
  const season = String(object?.metadata?.season ?? '');
  const product = String(object?.metadata?.product ?? '');
  const leagueId = String(object?.metadata?.leagueId ?? '');
  const id = String(event?.id ?? '');
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (object?.payment_status !== 'paid') return { kind: 'ignore', why: `payment_status ${object?.payment_status}` };
    if (!uid || !season) return { kind: 'ignore', why: 'no uid or season in metadata' };
    if (!id) return { kind: 'ignore', why: 'no event id' };
    if (product === CHARTER_PRODUCT_ID) {
      const ref = charterRef(object?.payment_intent);
      if (!leagueId || !ref) return { kind: 'ignore', why: 'charter without a league or payment intent' };
      return { kind: 'charter', uid, season, leagueId, ref };
    }
    return { kind: 'grant', uid, season, ref: id };
  }
  if (type === 'charge.dispute.created') {
    // The event object is a Dispute, not the charge: it has the PaymentIntent but none of the
    // metadata. A charter is found from its grant record by that PaymentIntent.
    const ref = charterRef(object?.payment_intent);
    if (product !== PASS_PRODUCT_ID && ref) return { kind: 'uncharter', leagueId: leagueId || null, ref, reason: type };
  }
  if (type === 'charge.refunded' || type === 'charge.dispute.created') {
    if (product === CHARTER_PRODUCT_ID) {
      // A partial refund is a goodwill credit, not the charter given back.
      if (type === 'charge.refunded' && object?.refunded !== true) return { kind: 'ignore', why: 'partial charter refund' };
      const ref = charterRef(object?.payment_intent);
      if (!leagueId || !ref) return { kind: 'ignore', why: 'charter refund without a league or payment intent' };
      return { kind: 'uncharter', leagueId, ref, reason: type };
    }
    const refundUid = String(object?.metadata?.uid ?? '');
    if (!refundUid) return { kind: 'ignore', why: 'refund without a uid' };
    return { kind: 'revoke', uid: refundUid, reason: type };
  }
  return { kind: 'ignore', why: `unhandled type ${type || '(none)'}` };
}
