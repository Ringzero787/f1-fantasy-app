/**
 * Google sign-in on a build with no Play Services (F-093) — the Amazon Appstore build.
 *
 * Fire OS has no Play Services, so `@react-native-google-signin/google-signin` cannot work there
 * and the Amazon build has never offered Google at all. Someone who created their account with
 * Google on a phone and then picked up a Fire tablet had no way in: the only button was Login with
 * Amazon, which makes a *different* account. This is the last hole in cross-store sign-in (F-091).
 *
 * Same shape as the Apple and Amazon web flows: Google redirects to our own endpoint, the
 * authorization code is filed under `state = sha256(verifier)` and never reaches the device, and
 * the app trades its verifier for the result over HTTPS. See `handoffStore.ts`.
 *
 * Two things specific to Google:
 *
 *   - It redirects by GET, so the code lands in this request's log line. PKCE closes that: the
 *     token endpoint refuses a code without the verifier, and the verifier is only ever in the
 *     app's memory and the claim call's body. A log reader has a code they cannot spend.
 *   - What comes back to the device is Google's **id_token**, not a custom token. The app presents
 *     it to Firebase as a `google.com` credential, so it lands on the same Firebase account as the
 *     native Google sign-in on a phone — which is the entire point.
 */
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createHash } from 'crypto';
import { isSha256Hex, looksLikeGoogleAuthCode, looksLikeJwt } from './handoffGuards';
import { CLAIM_LIMIT, FILE_LIMIT, claimHandoff, fileHandoff, takeAuthRateSlot } from './handoffStore';
import { ipKey } from '../pitwall/handoffCore';

/** The *web* OAuth client — the same client id the native sign-in passes as webClientId, so both
 *  paths produce an id_token Firebase resolves to one account. Its secret is server-side only. */
const googleClientId = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

/** Must match EXPO_PUBLIC_GOOGLE_REDIRECT_URI in the app and the client's authorised redirect URI. */
const RETURN_URL = 'https://f1-app-18077.web.app/undercut/auth/google';
const APP_REDIRECT = 'theundercut://auth/google';

function bounce(res: { set: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } }, state: string, error?: string) {
  res.set('Location', `${APP_REDIRECT}?state=${state}${error ? `&error=${error}` : ''}`);
  res.set('Cache-Control', 'no-store');
  res.status(303).send('');
}

/** Google's return URL, reached through the Hosting rewrite at `/undercut/auth/google`. */
export const googleAuthRedirect = onRequest({ cors: false, maxInstances: 10 }, async (req, res) => {
  const state = (req.query ?? {}).state;
  if (!isSha256Hex(state)) {
    res.set('Cache-Control', 'no-store');
    res.status(400).send('Sign-in request not recognised. Start again from the app.');
    return;
  }

  const now = Date.now();
  if (!(await takeAuthRateSlot(ipKey(req.ip), now, FILE_LIMIT))) {
    bounce(res, state, 'rate_limited');
    return;
  }

  const err = (req.query ?? {}).error;
  if (typeof err === 'string' && err) {
    bounce(res, state, err === 'access_denied' ? 'cancelled' : 'failed');
    return;
  }

  const code = (req.query ?? {}).code;
  if (!looksLikeGoogleAuthCode(code)) {
    bounce(res, state, 'failed');
    return;
  }

  try {
    // `create`, so a second arrival for the same state cannot replace the filed code.
    if (!(await fileHandoff(state, { provider: 'google', credential: code, redirectUri: RETURN_URL }, now))) {
      bounce(res, state, 'replayed');
      return;
    }
  } catch (error) {
    console.error('googleAuthRedirect: could not file the handoff', error instanceof Error ? error.message : String(error));
    bounce(res, state, 'failed');
    return;
  }

  bounce(res, state);
});

/**
 * Trades the verifier for Google's id_token. The verifier does double duty: it unlocks the filed
 * code here, and it is the PKCE `code_verifier` Google demands to spend that code.
 */
export const claimGoogleSignIn = onCall(
  { secrets: [googleClientId, googleClientSecret], maxInstances: 10 },
  async (request) => {
    const verifier = (request.data ?? {}).verifier;
    if (!isSha256Hex(verifier)) throw new HttpsError('invalid-argument', 'Bad sign-in request.');

    const now = Date.now();
    if (!(await takeAuthRateSlot(ipKey(request.rawRequest?.ip), now, CLAIM_LIMIT))) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
    }

    const state = createHash('sha256').update(verifier).digest('hex');
    const claimed = await claimHandoff(state, now);
    if (!claimed.ok) {
      throw new HttpsError(
        claimed.reason === 'expired' ? 'deadline-exceeded' : 'not-found',
        claimed.reason === 'expired' ? 'That sign-in took too long. Try again.' : 'That sign-in has already been used or has expired.',
      );
    }
    if (claimed.record.provider !== 'google' || !looksLikeGoogleAuthCode(claimed.record.credential)) {
      throw new HttpsError('internal', 'Sign-in could not be completed.');
    }

    const body = new URLSearchParams({
      code: claimed.record.credential,
      client_id: googleClientId.value(),
      client_secret: googleClientSecret.value(),
      redirect_uri: claimed.record.redirectUri || RETURN_URL,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      // Google's body echoes the request; log its status, not its contents.
      console.error('Google token exchange failed:', tokenRes.status);
      throw new HttpsError('unauthenticated', 'Google could not confirm that sign in. Try again.');
    }

    const data = (await tokenRes.json()) as { id_token?: string };
    if (!looksLikeJwt(data.id_token)) throw new HttpsError('internal', 'Sign-in could not be completed.');

    return { idToken: data.id_token };
  },
);
