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
import { CREATE_LIMIT, REDEEM_LIMIT, cleanSource, ipKey, isWellFormedCode, HANDOFF_TTL_MS } from './handoffCore';
import { createHandoff, deleteOldHandoffs, redeemHandoff, takeRateSlot } from './handoffStore';
import { currentSeason, passActive, PASS_PRICE_USD, type Pass } from './pass';
import { expirePasses, grantPass, grantTrial, revokePass, stampClaim } from './passStore';
import { checkoutSessionParams, verifyStripeSignature, webhookAction } from './stripe';

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
  if (!(await takeRateSlot(db, ipKey(request.rawRequest?.ip), now, REDEEM_LIMIT))) throw new HttpsError('resource-exhausted', 'Too many attempts. Try again in a minute.');
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

/** Start a Stripe Checkout session for the signed-in user and return its URL. */
export const createCheckout = onCall({ region: 'us-central1', secrets: [stripeSecretKey] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const now = Date.now();
  const user = (await db.doc(`users/${uid}`).get()).data() ?? {};
  if (passActive(user.pass as Partial<Pass> | undefined, now)) throw new HttpsError('already-exists', 'You already have a Pit Wall Pass.');
  const season = currentSeason(now);
  const params = checkoutSessionParams(
    { uid, season, email: typeof user.email === 'string' ? user.email : request.auth?.token?.email ?? null },
    `${PORTAL_URL}/?paid=1`, `${PORTAL_URL}/?checkout=cancelled`,
  );
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
  return { url: body.url, priceUsd: PASS_PRICE_USD, season };
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
  const pass = await grantTrial(db, uid, currentSeason(Date.now()));
  if (!pass) throw new HttpsError('already-exists', 'You have already used your trial.');
  return { expiresAt: pass.expiresAt };
});

/** Nightly: drop expired passes, their claims and their leagues' Pro flag. */
export const expirePitWallPasses = onSchedule('every 24 hours', async () => {
  console.log('[pw] expired', await expirePasses(db), 'pass(es)');
});

/** Re-stamp the claim when a pass changes from anywhere (grant op, store purchase, support fix). */
export const onUserPassWritten = onDocumentWritten({ document: 'users/{uid}', retry: true }, async (event) => {
  const before = event.data?.before.data()?.pass as Partial<Pass> | undefined;
  const after = event.data?.after.data()?.pass as Partial<Pass> | undefined;
  if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) return;
  await stampClaim(event.params.uid, after ?? null);
});
