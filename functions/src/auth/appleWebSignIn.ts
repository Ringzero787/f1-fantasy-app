/**
 * Sign in with Apple on a build that has no Apple runtime (F-091).
 *
 * Undercut sells in three stores and a person's account belongs to none of them. Someone who
 * created an account with Apple on the iPhone and then installs the Play or Amazon build has no way
 * back into it: `expo-apple-authentication` is an iOS-only module, so the Apple button simply is not
 * there. Apple's web flow fills the gap, but it cannot be done from the device alone — Apple returns
 * the identity token by HTTP POST (`response_mode=form_post`) to a registered https URL, which a
 * phone is not. These two functions are that URL and the way the app collects the result.
 *
 *   1. The app makes a random `verifier`, keeps it, and sends `state = sha256(verifier)` to Apple.
 *   2. Apple POSTs the identity token here. `appleAuthRedirect` files it under `state` and bounces
 *      the browser to `theundercut://auth/apple?state=…` — the token itself never rides the
 *      redirect, because a custom scheme on Android is claimable by any installed app and an Apple
 *      identity token is enough to sign in as its owner.
 *   3. The app calls `claimAppleSignIn` with the `verifier`. Only the app that started the flow has
 *      it; an app that intercepted the redirect has `state`, from which the verifier cannot be
 *      recovered. The record is one-shot and short-lived.
 *
 * The token is handed back to the app rather than exchanged for a custom token here, deliberately:
 * the app passes it to Firebase as an `apple.com` credential, so it resolves to the *same* Firebase
 * account as a native Apple sign-in on iOS. Minting a custom token would invent a second identity
 * and defeat the point of the feature.
 */
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { isSha256Hex, looksLikeJwt, appleDisplayName, appleDeepLink } from './handoffGuards';

const HANDOFF = 'auth_handoff';
/** Long enough for Apple's consent screen, short enough that a stolen `state` is worthless. */
const TTL_MS = 10 * 60 * 1000;

function bounce(res: { set: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } }, location: string) {
  // 303 and not 302: Apple arrives by POST, and a 302 invites the browser to repeat the POST
  // against the app's scheme. 303 says "GET the next thing", which is what a deep link is.
  res.set('Location', location);
  res.set('Cache-Control', 'no-store');
  res.status(303).send('');
}

/**
 * Apple's return URL. Reached through the Firebase Hosting rewrite at
 * `/undercut/auth/apple`, because Apple requires the return URL to sit on a domain registered and
 * verified under the Services ID, and `cloudfunctions.net` cannot serve the verification file.
 */
export const appleAuthRedirect = onRequest({ cors: false }, async (req, res) => {
  const src = req.method === 'POST' ? (req.body ?? {}) : (req.query ?? {});
  const state = (src as Record<string, unknown>).state;

  // Without a usable `state` there is no app session to return to, so there is nowhere to send an
  // error either. This is the only branch that renders anything.
  if (!isSha256Hex(state)) {
    res.set('Cache-Control', 'no-store');
    res.status(400).send('Sign-in request not recognised. Start again from the app.');
    return;
  }

  const err = (src as Record<string, unknown>).error;
  if (typeof err === 'string' && err) {
    // Apple's own words are not for the player, and a cancellation is not a failure.
    bounce(res, appleDeepLink(state, err));
    return;
  }

  const idToken = (src as Record<string, unknown>).id_token;
  if (!looksLikeJwt(idToken)) {
    bounce(res, appleDeepLink(state, 'invalid_token'));
    return;
  }

  const displayName = appleDisplayName((src as Record<string, unknown>).user);

  try {
    await admin.firestore().collection(HANDOFF).doc(state).set({
      provider: 'apple',
      idToken,
      displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + TTL_MS),
    });
  } catch (error) {
    console.error('appleAuthRedirect: could not file the handoff', error instanceof Error ? error.message : String(error));
    bounce(res, appleDeepLink(state, 'store_failed'));
    return;
  }

  bounce(res, appleDeepLink(state));
});

/**
 * Collects the filed token. Unauthenticated by necessity — the caller is signing in — so the
 * verifier is the whole of the authorisation: it is 32 random bytes that never left the device.
 */
export const claimAppleSignIn = onCall(async (request) => {
  const verifier = (request.data ?? {}).verifier;
  if (!isSha256Hex(verifier)) throw new HttpsError('invalid-argument', 'Bad sign-in request.');

  const state = createHash('sha256').update(verifier).digest('hex');
  const ref = admin.firestore().collection(HANDOFF).doc(state);

  // One shot: read and delete together, so a replay of the same verifier finds nothing. The delete
  // happens even when the record has expired, which is also how expired records get collected.
  const snap = await admin.firestore().runTransaction(async (tx) => {
    const found = await tx.get(ref);
    if (found.exists) tx.delete(ref);
    return found;
  });

  if (!snap.exists) throw new HttpsError('not-found', 'That sign-in has already been used or has expired.');
  const data = snap.data() as { idToken?: string; displayName?: string | null; expiresAt?: admin.firestore.Timestamp };
  if (!data.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError('deadline-exceeded', 'That sign-in took too long. Try again.');
  }
  if (!looksLikeJwt(data.idToken)) throw new HttpsError('internal', 'Sign-in could not be completed.');

  return { idToken: data.idToken, displayName: data.displayName ?? null };
});
