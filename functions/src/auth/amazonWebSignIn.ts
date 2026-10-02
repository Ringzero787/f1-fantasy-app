/**
 * Login with Amazon, hardened so it can be offered on every build (F-091).
 *
 * Amazon sign-in was only ever on the Amazon build, and its flow sends the authorization code to
 * the app on `theundercut://auth/amazon?code=…`. On Android any installed app may claim that
 * scheme, and `signInWithAmazon` will exchange a code for a Firebase session for whoever presents
 * it — so a code read off that redirect is an account takeover, Pit Wall Pass included. On a Fire
 * tablet that was a narrow audience; offering the button on Play and iOS would have made it
 * everyone, which is why this exists.
 *
 * Here the browser is sent to our own endpoint instead. The code is filed under
 * `state = sha256(verifier)` and never reaches the device at all: the app trades its verifier for a
 * Firebase custom token, and the exchange with Amazon happens server-side. An app that intercepts
 * the redirect gets a state it cannot invert and no code.
 *
 * The old `signInWithAmazon` callable stays for builds already installed.
 */
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { isSha256Hex, looksLikeAuthCode } from './handoffGuards';
import { CLAIM_LIMIT, FILE_LIMIT, claimHandoff, fileHandoff, takeAuthRateSlot } from './handoffStore';
import { exchangeAmazonCode, upsertAmazonUser } from './amazonAccount';
import { ipKey } from '../pitwall/handoffCore';

const amazonClientId = defineSecret('AMAZON_CLIENT_ID');
const amazonClientSecret = defineSecret('AMAZON_CLIENT_SECRET');

/** Must match EXPO_PUBLIC_AMAZON_REDIRECT_URI in the app, and the LWA allowed return URL. */
const RETURN_URL = 'https://f1-app-18077.web.app/undercut/auth/amazon';
const APP_REDIRECT = 'theundercut://auth/amazon';

function bounce(res: { set: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } }, state: string, error?: string) {
  res.set('Location', `${APP_REDIRECT}?state=${state}${error ? `&error=${error}` : ''}`);
  res.set('Cache-Control', 'no-store');
  res.status(303).send('');
}

/**
 * Amazon's return URL, reached through the Hosting rewrite at `/undercut/auth/amazon`. Unlike
 * Apple, Login with Amazon redirects by GET, so the code does appear in this request's log line —
 * acceptable, because a code is worth nothing without the client secret, which is ours alone.
 */
export const amazonAuthRedirect = onRequest({ cors: false, maxInstances: 10 }, async (req, res) => {
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
  if (!looksLikeAuthCode(code)) {
    bounce(res, state, 'failed');
    return;
  }

  try {
    // `create`, so a second arrival for the same state cannot replace the filed code.
    if (!(await fileHandoff(state, { provider: 'amazon', credential: code, redirectUri: RETURN_URL }, now))) {
      bounce(res, state, 'replayed');
      return;
    }
  } catch (error) {
    console.error('amazonAuthRedirect: could not file the handoff', error instanceof Error ? error.message : String(error));
    bounce(res, state, 'failed');
    return;
  }

  bounce(res, state);
});

/**
 * Trades the verifier for a Firebase session. The authorization code is used here and never sent to
 * the device, so a redirect-intercepting app has nothing to exchange.
 */
export const claimAmazonSignIn = onCall(
  { secrets: [amazonClientId, amazonClientSecret], maxInstances: 10 },
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
    if (claimed.record.provider !== 'amazon' || !looksLikeAuthCode(claimed.record.credential)) {
      throw new HttpsError('internal', 'Sign-in could not be completed.');
    }

    let uid: string;
    let profile;
    try {
      profile = await exchangeAmazonCode(
        claimed.record.credential,
        claimed.record.redirectUri || RETURN_URL,
        amazonClientId.value(),
        amazonClientSecret.value(),
      );
      uid = await upsertAmazonUser(profile);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      if (reason === 'exchange-failed' || reason === 'profile-failed' || reason === 'profile-invalid') {
        throw new HttpsError('unauthenticated', 'Amazon could not confirm that sign in. Try again.');
      }
      throw new HttpsError('internal', 'Sign-in could not be completed.');
    }

    return {
      customToken: await admin.auth().createCustomToken(uid),
      displayName: profile.name ?? '',
      email: profile.email ?? '',
    };
  },
);
