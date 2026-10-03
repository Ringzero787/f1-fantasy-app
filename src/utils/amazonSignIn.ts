/**
 * Login with Amazon.
 *
 * One flow, and it is the hardened one: the browser goes to our own endpoint, Amazon's
 * authorization code is filed server-side, and the app trades a verifier and the ticket that rode
 * the redirect for a Firebase custom token. The code never reaches the device.
 *
 * The original flow is gone from here (F-094). It brought the code back on
 * `theundercut://auth/amazon` with no state and no ticket, and `signInWithAmazon` would exchange
 * whatever code it was handed — so any app claiming that scheme could read a code and take the
 * account, and could also race the redirect to sign someone into *its* account instead. It was
 * being kept as a fallback for builds made before the endpoint existed, which meant a new build
 * with the endpoint unconfigured silently downgraded to it. A sign-in button that is absent is
 * better than one that is unsafe, so `amazonWebSignInAvailable()` now hides the pill instead.
 *
 * The `signInWithAmazon` callable stays deployed for versions already installed; this is only about
 * what a new build does.
 */
import * as WebBrowser from 'expo-web-browser';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { randomHex, sha256Hex } from './nonce';
import { readAuthRedirect } from './authRedirect';

const AMAZON_CLIENT_ID = process.env.EXPO_PUBLIC_AMAZON_CLIENT_ID!;
/** Our own endpoint (Hosting rewrite → `amazonAuthRedirect`). Must match RETURN_URL there. */
const REDIRECT_URI = process.env.EXPO_PUBLIC_AMAZON_REDIRECT_URI ?? '';
const APP_REDIRECT = 'theundercut://auth/amazon';

/** Whether the hardened flow is configured, and so whether the button is safe to show anywhere. */
export function amazonWebSignInAvailable(): boolean {
  return !!AMAZON_CLIENT_ID && !!REDIRECT_URI;
}

const authUrl = (state: string): string =>
  'https://www.amazon.com/ap/oa' +
  '?client_id=' + encodeURIComponent(AMAZON_CLIENT_ID) +
  '&scope=profile' +
  '&response_type=code' +
  '&state=' + encodeURIComponent(state) +
  '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);

/**
 * The hardened flow. Returns a Firebase custom token; the authorization code never comes near the
 * device.
 */
export async function amazonWebSignIn(): Promise<{ customToken: string; displayName: string; email: string }> {
  // Guard here as well as at the pill. Without it an unconfigured build opens Amazon's authorize
  // URL with an empty redirect_uri, which is a broken sign-in at best — and the only return URL
  // Amazon has on file is the old static page, the one that bounces the code onto a scheme any app
  // may claim.
  if (!amazonWebSignInAvailable()) throw new Error('Amazon sign in is not configured in this build.');

  const verifier = await randomHex(32);
  const state = await sha256Hex(verifier);

  const result = await WebBrowser.openAuthSessionAsync(authUrl(state), APP_REDIRECT);
  if (result.type !== 'success' || !result.url) throw new Error('Sign in cancelled');

  const { ticket } = readAuthRedirect(result.url, state, 'Amazon');

  const claim = httpsCallable<{ verifier: string; ticket: string }, { customToken: string; displayName: string; email: string }>(functions, 'claimAmazonSignIn');
  const { customToken, displayName, email } = (await claim({ verifier, ticket })).data;
  if (!customToken) throw new Error('Amazon could not complete the sign in. Try again.');
  return { customToken, displayName, email };
}
