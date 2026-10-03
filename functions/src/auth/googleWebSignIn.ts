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
import { handoffDeepLink, isSha256Hex, looksLikeGoogleAuthCode, looksLikeJwt } from './handoffGuards';
import { CLAIM_LIMIT, FILE_LIMIT, GLOBAL_FILE_LIMIT, GLOBAL_KEY, claimHandoff, fileHandoff, takeAuthRateSlot } from './handoffStore';
import { ipKey } from '../pitwall/handoffCore';
import { callerIp } from './callerIp';

/** The *web* OAuth client — the same client id the native sign-in passes as webClientId, so both
 *  paths produce an id_token Firebase resolves to one account. Its secret is server-side only. */
const googleClientId = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
const googleClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

/** Must match the app's redirect URI and the provider's registered return URL. */
const RETURN_URL = 'https://f1-app-18077.web.app/undercut/auth/google';

function bounce(
  res: { set: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } },
  state: string,
  opts: { ticket?: string; error?: unknown } = {},
) {
  res.set('Location', handoffDeepLink('google', state, { ...opts, cancelCode: 'access_denied' }));
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
  // Per caller and overall: the per-caller key is partly caller-written, so on its own it would
  // be a cap anyone could rotate out of.
  if (!(await takeAuthRateSlot(ipKey(callerIp(req)), now, FILE_LIMIT))
    || !(await takeAuthRateSlot(GLOBAL_KEY, now, GLOBAL_FILE_LIMIT))) {
    bounce(res, state, { error: 'rate_limited' });
    return;
  }

  const err = (req.query ?? {}).error;
  if (typeof err === 'string' && err) {
    // The provider's own word goes through untouched; collapsing it to cancelled or failed is
    // handoffDeepLink's job, so all three flows do it the same way and in one place.
    bounce(res, state, { error: err });
    return;
  }

  const code = (req.query ?? {}).code;
  if (!looksLikeGoogleAuthCode(code)) {
    bounce(res, state, { error: 'failed' });
    return;
  }

  let ticket: string | null;
  try {
    // `create`, so a second arrival for the same state cannot replace the filed code.
    ticket = await fileHandoff(state, { provider: 'google', credential: code, redirectUri: RETURN_URL }, now);
    if (!ticket) {
      bounce(res, state, { error: 'replayed' });
      return;
    }
  } catch (error) {
    console.error('googleAuthRedirect: could not file the handoff', error instanceof Error ? error.message : String(error));
    bounce(res, state, { error: 'failed' });
    return;
  }

  bounce(res, state, { ticket });
});

/**
 * Trades the verifier for Google's id_token. The verifier does double duty: it unlocks the filed
 * code here, and it is the PKCE `code_verifier` Google demands to spend that code.
 */
export const claimGoogleSignIn = onCall(
  { secrets: [googleClientId, googleClientSecret], maxInstances: 10 },
  async (request) => {
    const { verifier, ticket } = request.data ?? {};
    // Both halves, or nothing. See handoffStore.ts for why one of them is never enough.
    if (!isSha256Hex(verifier) || !isSha256Hex(ticket)) throw new HttpsError('invalid-argument', 'Bad sign-in request.');

    const now = Date.now();
    if (!(await takeAuthRateSlot(ipKey(callerIp(request.rawRequest)), now, CLAIM_LIMIT))) {
      throw new HttpsError('resource-exhausted', 'Too many attempts. Wait a minute and try again.');
    }

    const state = createHash('sha256').update(verifier).digest('hex');
    const claimed = await claimHandoff(state, ticket, now);
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
