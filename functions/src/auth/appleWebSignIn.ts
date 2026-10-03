/**
 * Sign in with Apple on a build that has no Apple runtime (F-091).
 *
 * Undercut sells in three stores and a person's account belongs to none of them. Someone who
 * created an account with Apple on the iPhone and then installs the Play or Amazon build has no way
 * back into it: `expo-apple-authentication` is an iOS-only module, so the Apple button simply is not
 * there. Apple's web flow fills the gap, but it cannot be done from the device alone — Apple returns
 * the identity token by HTTP POST (`response_mode=form_post`) to a registered https URL, which a
 * phone is not. This function is that URL; `handoffStore.ts` explains how the token gets from here
 * to the app without riding a hijackable redirect.
 *
 * The token is handed back to the app rather than exchanged for a custom token here, deliberately:
 * the app passes it to Firebase as an `apple.com` credential, so it resolves to the *same* Firebase
 * account as a native Apple sign-in on iOS. Minting a custom token would invent a second identity
 * and defeat the point of the feature.
 */
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { isSha256Hex, looksLikeJwt, appleDisplayName, appleDeepLink } from './handoffGuards';
import { CLAIM_LIMIT, FILE_LIMIT, claimHandoff, fileHandoff, takeAuthRateSlot } from './handoffStore';
import { ipKey } from '../pitwall/handoffCore';
import { callerIp } from './callerIp';

function bounce(res: { set: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } }, location: string) {
  // 303 and not 302: Apple arrives by POST, and a 302 invites the browser to repeat the POST
  // against the app's scheme. 303 says "GET the next thing", which is what a deep link is.
  res.set('Location', location);
  res.set('Cache-Control', 'no-store');
  res.status(303).send('');
}

/**
 * Apple's return URL. Reached through the Firebase Hosting rewrite at `/undercut/auth/apple`,
 * because Apple requires the return URL to sit on a domain registered and verified under the
 * Services ID, and `cloudfunctions.net` cannot serve the verification file.
 *
 * `maxInstances` is here because this is an unauthenticated endpoint that writes: a loop against it
 * should cost a queue, not a bill.
 */
export const appleAuthRedirect = onRequest({ cors: false, maxInstances: 10 }, async (req, res) => {
  // Apple only ever uses form_post. Accepting a GET would put identity tokens in request logs and
  // browser history and make the write reachable from an <img> tag.
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    res.status(405).send('Start again from the app.');
    return;
  }

  const src = (req.body ?? {}) as Record<string, unknown>;
  const state = src.state;

  // Without a usable `state` there is no app session to return to, so there is nowhere to send an
  // error either. This is the only branch that renders anything.
  if (!isSha256Hex(state)) {
    res.set('Cache-Control', 'no-store');
    res.status(400).send('Sign-in request not recognised. Start again from the app.');
    return;
  }

  const now = Date.now();
  if (!(await takeAuthRateSlot(ipKey(callerIp(req)), now, FILE_LIMIT))) {
    bounce(res, appleDeepLink(state, 'rate_limited'));
    return;
  }

  if (typeof src.error === 'string' && src.error) {
    // Apple's own words are not for the player, and a cancellation is not a failure.
    bounce(res, appleDeepLink(state, src.error));
    return;
  }

  if (!looksLikeJwt(src.id_token)) {
    bounce(res, appleDeepLink(state, 'invalid_token'));
    return;
  }

  let ticket: string | null;
  try {
    ticket = await fileHandoff(state, {
      provider: 'apple',
      credential: src.id_token,
      // Apple sends the chosen name once, on the very first consent, and never again.
      displayName: appleDisplayName(src.user),
    }, now);
    if (!ticket) {
      bounce(res, appleDeepLink(state, 'replayed'));
      return;
    }
  } catch (error) {
    console.error('appleAuthRedirect: could not file the handoff', error instanceof Error ? error.message : String(error));
    bounce(res, appleDeepLink(state, 'store_failed'));
    return;
  }

  bounce(res, appleDeepLink(state, undefined, ticket));
});

/**
 * Collects the filed token. Unauthenticated by necessity — the caller is signing in — so the
 * verifier is the whole of the authorisation: 32 random bytes that never left the device.
 */
export const claimAppleSignIn = onCall({ maxInstances: 10 }, async (request) => {
  const { verifier, ticket } = request.data ?? {};
  // Both halves, or nothing: the verifier proves this device started the flow, the ticket proves it
  // is the device the redirect came back to. See handoffStore.ts.
  if (!isSha256Hex(verifier) || !isSha256Hex(ticket)) throw new HttpsError('invalid-argument', 'Bad sign-in request.');

  const now = Date.now();
  if (!(await takeAuthRateSlot(ipKey(callerIp(request.rawRequest)), now, CLAIM_LIMIT))) {
    throw new HttpsError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
  }

  const { createHash } = await import('crypto');
  const state = createHash('sha256').update(verifier).digest('hex');
  const claimed = await claimHandoff(state, ticket, now);
  if (!claimed.ok) {
    throw new HttpsError(
      claimed.reason === 'expired' ? 'deadline-exceeded' : 'not-found',
      claimed.reason === 'expired' ? 'That sign-in took too long. Try again.' : 'That sign-in has already been used or has expired.',
    );
  }
  if (claimed.record.provider !== 'apple' || !looksLikeJwt(claimed.record.credential)) {
    throw new HttpsError('internal', 'Sign-in could not be completed.');
  }

  return { idToken: claimed.record.credential, displayName: claimed.record.displayName ?? null };
});
