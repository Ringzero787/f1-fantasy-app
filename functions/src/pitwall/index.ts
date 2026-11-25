/**
 * Cloud Functions for Undercut Pit Wall, exported as the `pw` group (deployed names `pw-…`),
 * so a portal deploy (`--only functions:pw`) never touches scoring or lock functions.
 *
 * v2 callables on purpose: they run as the compute service account, the same one signInWithAmazon
 * uses to mint custom tokens. The v1 runtime account lacks that permission (redeem returned
 * INTERNAL on the first deploy).
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { CREATE_LIMIT, REDEEM_LIMIT, cleanSource, clientIpOf, ipKey, isWellFormedCode, HANDOFF_TTL_MS } from './handoffCore';
import { createHandoff, deleteOldHandoffs, redeemHandoff, takeRateSlot } from './handoffStore';
import { passActive, PASS_PRICE_USD, PASS_PRODUCT, saleSeason, type Pass } from './pass';
import { expirePasses, grantPass, grantTrial, revokePass, stampClaim } from './passStore';
import { CHARTER_PRODUCT_ID, checkoutSessionParams, verifyStripeSignature, webhookAction } from './stripe';
import { charterActive, charterCap, charterEnabled, charterGrantDecision, charterMemberIds, claimExpiry, claimInputsChanged, CHARTER_PRICE_CENTS, type CharterAccess } from '../charter/charter';
import { clearCharter, expireCharters, grantCharter, markRefunded } from '../charter/charterStore';
import { isUsableLeagueId } from '../utils/leagueId';

const db = admin.firestore();

/** Called by the signed-in app. Returns a single-use code the app puts in the portal URL fragment. */
export const createPortalHandoff = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const now = Date.now();
  if (!(await takeRateSlot(db, `uid_${uid}`, now, CREATE_LIMIT))) throw new HttpsError('resource-exhausted', 'Too many requests. Try again in a minute.');
  const code = await createHandoff(db, uid, cleanSource((request.data as { src?: unknown } | undefined)?.src), now);
  return { code, expiresInSeconds: HANDOFF_TTL_MS / 1000 };
});

/** Called by the portal, signed out. One answer for every failure, so a caller learns nothing about why. */
// The per-IP limit is a courtesy brake, not the defence: the address comes from the platform's front end and can
// be shared or rotated. The defence is the code itself (256 random bits, 60 seconds, single use). App Check for the
// web app is tracked in F-075's build notes and tightens this further.
export const redeemPortalHandoff = onCall({ region: 'us-central1' }, async (request) => {
  const now = Date.now();
  // behind Cloud Run's front end `req.ip` is the proxy hop, one key for everyone; the LAST
  // x-forwarded-for entry is the client — Google appends it, the earlier ones the caller can type
  const clientIp = clientIpOf(request.rawRequest?.headers?.['x-forwarded-for'], request.rawRequest?.ip);
  if (!(await takeRateSlot(db, ipKey(clientIp), now, REDEEM_LIMIT))) throw new HttpsError('resource-exhausted', 'Too many attempts. Try again in a minute.');
  const code = (request.data as { code?: unknown } | undefined)?.code;
  const uid = isWellFormedCode(code) ? await redeemHandoff(db, code, now) : null;
  if (!uid) throw new HttpsError('failed-precondition', 'This sign-in link is not valid any more.');
  let token: string;
  try {
    token = await admin.auth().createCustomToken(uid, { via: 'pw_handoff' });
  } catch (e) {
    console.error('[pw] createCustomToken failed:', e);
    throw new HttpsError('internal', 'Sign-in is not available right now.');
  }
  return { token };
});

export const cleanupHandoffs = onSchedule('every 24 hours', async () => {
  console.log('[pw] deleted', await deleteOldHandoffs(db, Date.now()), 'old handoff rows');
});

// ─── Pit Wall Pass (F-068) ───
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const PORTAL_URL = 'https://pitwall.humannpc.com';

/**
 * Start a Stripe Checkout session for the signed-in user and return its URL.
 * `{}` (or `{ product: 'pitwall.pass.season' }`) is the personal pass, as before.
 * `{ product: 'pitwall.charter.season', leagueId }` charters a league the caller owns (F-175); it is
 * refused while `config/app.charter.enabled` is not true, except on a Stripe test key.
 */
export const createCheckout = onCall({ region: 'us-central1', secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const now = Date.now();
  const input = (request.data ?? {}) as { product?: unknown; leagueId?: unknown };
  const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
  // F-146: from December the pass being sold is next season's
  const season = saleSeason(now);
  const email = typeof user.email === 'string' ? user.email : request.auth?.token?.email ?? null;
  let params: Record<string, string>;
  if (input.product === CHARTER_PRODUCT_ID) {
    const leagueId = input.leagueId;
    if (typeof leagueId !== 'string' || !isUsableLeagueId(leagueId)) throw new HttpsError('invalid-argument', 'leagueId required');
    const testKey = stripeSecretKey.value().startsWith('sk_test_');
    if (!testKey && !charterEnabled((await db.doc('config/app').get()).data())) throw new HttpsError('failed-precondition', 'Charter is not on sale yet.');
    const league = (await db.doc(`leagues/${leagueId}`).get()).data() ?? null;
    // Refuse before Stripe takes any money; the webhook checks the same again when it grants.
    const members = await db.collection(`leagues/${leagueId}/members`).get();
    const memberCount = charterMemberIds(league?.ownerId, members.docs.map((d) => ({ id: d.id, status: d.data()?.status }))).length;
    const decision = charterGrantDecision({ league, buyerId: uid, season, ref: '', now, memberCount });
    if (decision.kind === 'refuse') {
      if (decision.reason === 'not-owner' || decision.reason === 'no-league') throw new HttpsError('permission-denied', 'Only the league owner can charter it.');
      if (decision.reason === 'too-large') throw new HttpsError('failed-precondition', `A Charter covers ${charterCap(league)} players (22, plus 3 for each slot pack); this league has ${memberCount}. Add slots first.`);
      throw new HttpsError('already-exists', `This league is already chartered for ${season}.`);
    }
    params = checkoutSessionParams({ uid, season, email, product: CHARTER_PRODUCT_ID, leagueId },
      `${PORTAL_URL}/?chartered=${encodeURIComponent(leagueId)}`, `${PORTAL_URL}/?checkout=cancelled`);
  } else {
    if (input.product !== undefined && input.product !== PASS_PRODUCT) throw new HttpsError('invalid-argument', 'Unknown product.');
    // The personal pass, read from users/{uid}.pass, never from the claim: the claim also carries
    // Charter access (F-175), and a Charter member may still buy a pass of their own.
    if (passActive(user.pass as Partial<Pass> | undefined, now)) throw new HttpsError('already-exists', 'You already have a Pit Wall Pass.');
    params = checkoutSessionParams({ uid, season, email }, `${PORTAL_URL}/?paid=1`, `${PORTAL_URL}/?checkout=cancelled`);
  }
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${stripeSecretKey.value()}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const body = await res.json() as { url?: string; error?: { message?: string } };
  if (!res.ok || !body.url) {
    console.error('[pw] stripe checkout failed:', res.status, body.error?.message);
    throw new HttpsError('internal', 'Checkout is not available right now.');
  }
  return { url: body.url, priceUsd: input.product === CHARTER_PRODUCT_ID ? CHARTER_PRICE_CENTS / 100 : PASS_PRICE_USD, season };
});

/**
 * Stripe webhook. Verified against the signing secret on the RAW body, idempotent on the event id,
 * and it answers 200 to anything it means to ignore so Stripe stops retrying.
 */
export const stripeWebhook = onRequest({ region: 'us-central1', secrets: [stripeWebhookSecret] }, async (req, res) => {
  const raw = (req.rawBody ?? Buffer.from('')).toString('utf8');
  const verified = verifyStripeSignature(raw, req.get('stripe-signature'), stripeWebhookSecret.value(), Math.floor(Date.now() / 1000));
  if (!verified.ok) {
    console.warn('[pw] stripe webhook rejected:', verified.reason);
    res.status(400).send(verified.reason);
    return;
  }
  const action = webhookAction(verified.event);
  try {
    if (action.kind === 'grant') {
      const pass = await grantPass(db, action.uid, action.season, 'stripe', action.ref);
      console.log('[pw] pass granted from stripe', action.uid, action.season, 'until', new Date(pass.expiresAt).toISOString());
    } else if (action.kind === 'revoke') {
      await revokePass(db, action.uid, action.reason);
      console.log('[pw] pass revoked', action.uid, action.reason);
    } else if (action.kind === 'charter') {
      // Never grantPass (BUILD.md, "The entitlement trap"). A refusal is recorded on charter_grants
      // and answered 200: retrying cannot make a non-owner the owner, and support refunds from the record.
      const r = await grantCharter(db, { leagueId: action.leagueId, buyerId: action.uid, season: action.season, source: 'stripe', ref: action.ref });
      if (r.applied) console.log('[charter] chartered from stripe', r.leagueId, action.season, 'members', r.members, r.replay ? '(replay)' : '');
      else console.error('[charter] paid stripe charter NOT applied', action.leagueId, action.uid, r.reason, action.ref);
    } else if (action.kind === 'uncharter') {
      // Never revokePass: only this league's charter, and only if this payment is the one that bought it.
      const leagueId = action.leagueId ?? ((await db.collection('charter_grants').doc(action.ref).get()).data()?.leagueId as string | undefined) ?? null;
      const done = leagueId ? await clearCharter(db, { leagueId, ref: action.ref, reason: action.reason }) : false;
      // A dispute that arrives before its charter was granted still has to stop that grant.
      if (!leagueId) await markRefunded(db, action.ref, action.reason);
      console.log('[charter] stripe', action.reason, action.ref, leagueId ?? '(no charter for this payment)', done ? 'cleared' : 'nothing to clear');
    } else {
      console.log('[pw] stripe webhook ignored:', action.why);
    }
  } catch (e) {
    // A failure here must be retried by Stripe, so answer 500.
    console.error('[pw] stripe webhook handling failed:', e);
    res.status(500).send('handler failed');
    return;
  }
  res.status(200).send('ok');
});

/** A member of a Pro league may take one 7-day portal trial, once. */
export const startLeagueTrial = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const leagueId = (request.data as { leagueId?: unknown } | undefined)?.leagueId;
  if (typeof leagueId !== 'string' || !leagueId || leagueId.includes('/')) throw new HttpsError('invalid-argument', 'leagueId required');
  const [league, member] = await Promise.all([db.doc(`leagues/${leagueId}`).get(), db.doc(`leagues/${leagueId}/members/${uid}`).get()]);
  if (!league.exists || !member.exists || member.data()?.status === 'pending') throw new HttpsError('permission-denied', 'You are not in that league.');
  if (league.data()?.pro !== true) throw new HttpsError('failed-precondition', 'That league is not a Pro league.');
  // F-175: a chartered league's approved members already read Pit Wall; a trial would be spent for nothing.
  if (charterActive(league.data(), Date.now())) throw new HttpsError('already-exists', 'This league is chartered: Pit Wall is already on for its members.');
  const pass = await grantTrial(db, uid, saleSeason(Date.now()));
  if (!pass) throw new HttpsError('already-exists', 'You have already used your trial.');
  return { expiresAt: pass.expiresAt };
});

/** Nightly: drop expired passes, their claims and their leagues' Pro flag. */
export const expirePitWallPasses = onSchedule('every 24 hours', async () => {
  console.log('[pw] expired', await expirePasses(db), 'pass(es)');
});

/** Nightly (F-175): clear charters whose season has ended, and their members' access. */
export const expireLeagueCharters = onSchedule('every 24 hours', async () => {
  console.log('[charter] expired', await expireCharters(db), 'charter(s)');
});

/** Re-stamp the claim when a pass changes from anywhere (grant op, store purchase, support fix). */
// F-175: the claim is the later of the personal pass and Charter access, so a change to either
// restamps it. Any other write to the user document (a display name, a push token) is skipped.
export const onUserPassWritten = onDocumentWritten({ document: 'users/{uid}', retry: true }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!claimInputsChanged(before, after)) return;
  // Stamp from the document as it is now, not from this event's snapshot: deliveries are not
  // ordered and retry replays old ones, so a late grant event must not bring back a revoked claim.
  const current = (await db.doc(`users/${event.params.uid}`).get()).data();
  const pass = current?.pass as Partial<Pass> | undefined;
  const charterAccess = current?.charterAccess as Partial<CharterAccess> | undefined;
  await stampClaim(event.params.uid, claimExpiry(pass, charterAccess, Date.now()));
});

// Deployed as pw-sweepRefundedPasses, inside the group, so `--only functions:pw` reaches it.
export { sweepRefundedPasses } from './refundSweep';
