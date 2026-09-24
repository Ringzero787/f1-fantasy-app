/**
 * Cloud Functions for Undercut Pit Wall, exported as the `pw` group (deployed names `pw-…`),
 * so a portal deploy (`--only functions:pw`) never touches scoring or lock functions.
 *
 * v2 callables on purpose: they run as the compute service account, the same one signInWithAmazon
 * uses to mint custom tokens. The v1 runtime account lacks that permission (redeem returned
 * INTERNAL on the first deploy).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { CREATE_LIMIT, REDEEM_LIMIT, cleanSource, ipKey, isWellFormedCode, HANDOFF_TTL_MS } from './handoffCore';
import { createHandoff, deleteOldHandoffs, redeemHandoff, takeRateSlot } from './handoffStore';

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
