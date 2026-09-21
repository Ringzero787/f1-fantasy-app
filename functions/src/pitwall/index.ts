/**
 * Cloud Functions for Undercut Pit Wall, exported as the `pw` group (deployed names `pw-…`),
 * so a portal deploy (`--only functions:pw`) never touches scoring or lock functions.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { CREATE_LIMIT, REDEEM_LIMIT, cleanSource, ipKey, isWellFormedCode, HANDOFF_TTL_MS } from './handoffCore';
import { createHandoff, deleteOldHandoffs, redeemHandoff, takeRateSlot } from './handoffStore';

const db = admin.firestore();

/** Called by the signed-in app. Returns a single-use code the app puts in the portal URL fragment. */
export const createPortalHandoff = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const now = Date.now();
  if (!(await takeRateSlot(db, `uid_${uid}`, now, CREATE_LIMIT))) throw new functions.https.HttpsError('resource-exhausted', 'Too many requests. Try again in a minute.');
  const code = await createHandoff(db, uid, cleanSource(data?.src), now);
  return { code, expiresInSeconds: HANDOFF_TTL_MS / 1000 };
});

/** Called by the portal, signed out. One answer for every failure, so a caller learns nothing about why. */
export const redeemPortalHandoff = functions.https.onCall(async (data, context) => {
  const now = Date.now();
  if (!(await takeRateSlot(db, ipKey(context.rawRequest?.ip), now, REDEEM_LIMIT))) throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Try again in a minute.');
  const code = data?.code;
  const uid = isWellFormedCode(code) ? await redeemHandoff(db, code, now) : null;
  if (!uid) throw new functions.https.HttpsError('failed-precondition', 'This sign-in link is not valid any more.');
  return { token: await admin.auth().createCustomToken(uid, { via: 'pw_handoff' }) };
});

export const cleanupHandoffs = onSchedule('every 24 hours', async () => {
  console.log('[pw] deleted', await deleteOldHandoffs(db, Date.now()), 'old handoff rows');
});
