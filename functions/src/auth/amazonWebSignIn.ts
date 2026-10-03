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
import { handoffDeepLink, isSha256Hex, looksLikeAuthCode } from './handoffGuards';
import { CLAIM_LIMIT, FILE_LIMIT, GLOBAL_FILE_LIMIT, GLOBAL_KEY, claimHandoff, fileHandoff, takeAuthRateSlot } from './handoffStore';
import { exchangeAmazonCode, upsertAmazonUser } from './amazonAccount';
import { ipKey } from '../pitwall/handoffCore';
import { callerIp } from './callerIp';

const amazonClientId = defineSecret('AMAZON_CLIENT_ID');
const amazonClientSecret = defineSecret('AMAZON_CLIENT_SECRET');

/** Must match the app's redirect URI and the provider's registered return URL. */
const RETURN_URL = 'https://f1-app-18077.web.app/undercut/auth/amazon';

function bounce(
  res: { set: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } },
  state: string,
  opts: { ticket?: string; error?: unknown } = {},
) {
  res.set('Location', handoffDeepLink('amazon', state, { ...opts, cancelCode: 'access_denied' }));
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
  if (!looksLikeAuthCode(code)) {
    bounce(res, state, { error: 'failed' });
    return;
  }

  let ticket: string | null;
  try {
    // `create`, so a second arrival for the same state cannot replace the filed code.
    ticket = await fileHandoff(state, { provider: 'amazon', credential: code, redirectUri: RETURN_URL }, now);
    if (!ticket) {
      bounce(res, state, { error: 'replayed' });
      return;
    }
  } catch (error) {
    console.error('amazonAuthRedirect: could not file the handoff', error instanceof Error ? error.message : String(error));
    bounce(res, state, { error: 'failed' });
    return;
  }

  bounce(res, state, { ticket });
});

/**
 * Trades the verifier for a Firebase session. The authorization code is used here and never sent to
 * the device, so a redirect-intercepting app has nothing to exchange.
 */
export const claimAmazonSignIn = onCall(
  { secrets: [amazonClientId, amazonClientSecret], maxInstances: 10 },
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
