/**
 * Google sign-in on a build with no Play Services (F-093) — the Amazon Appstore build.
 *
 * Fire OS has no Play Services, so the native module cannot work there and the Amazon build has
 * never offered Google at all. Someone who made their account with Google on a phone and then
 * picked up a Fire tablet had only Login with Amazon, which makes a *different* account.
 *
 * Google's web flow instead: a browser session, Google's own consent screen, and the id_token
 * collected from our own endpoint (`functions/src/auth/googleWebSignIn.ts`) rather than from the
 * redirect. The token goes to the same `authService.signInWithGoogle` a phone uses, so both land on
 * one Firebase account.
 *
 * Turned on by setting EXPO_PUBLIC_GOOGLE_REDIRECT_URI at build time; without it the pill stays
 * hidden rather than offering a button that cannot work.
 */
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { randomHex, sha256Hex } from './nonce';
import { readAuthRedirect } from './authRedirect';
import { base64UrlFromBase64 } from './base64url';

/** The web OAuth client — the same id the native flow passes as webClientId. */
const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
/** Our own endpoint (Hosting rewrite → `googleAuthRedirect`). Must match RETURN_URL there. */
const REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ?? '';
const APP_REDIRECT = 'theundercut://auth/google';

const isExpoGo = Constants.appOwnership === 'expo';

/** Whether the browser flow is configured. Only ever offered where the native one cannot run. */
export function googleWebSignInAvailable(): boolean {
  return !!CLIENT_ID && !!REDIRECT_URI && !isExpoGo;
}

/** base64url of the SHA-256 of the verifier, which is what PKCE's S256 method wants. */
async function codeChallenge(verifier: string): Promise<string> {
  return base64UrlFromBase64(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
}

export async function googleWebSignIn(): Promise<string> {
  if (!googleWebSignInAvailable()) throw new Error('Google sign in is not configured in this build.');

  // One secret, two jobs: it unlocks the filed code on our server, and it is the PKCE verifier
  // Google demands before it will spend that code. Google redirects by GET, so the code appears in
  // our own request logs; without PKCE a log reader could spend it.
  const verifier = await randomHex(32);
  const state = await sha256Hex(verifier);

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&scope=' + encodeURIComponent('openid email profile') +
    '&state=' + encodeURIComponent(state) +
    '&code_challenge=' + encodeURIComponent(await codeChallenge(verifier)) +
    '&code_challenge_method=S256' +
    // Always ask which account. Without it a device with a live Google session signs in with that
    // one and never shows a chooser — wrong on a shared Fire tablet, and the silent path is exactly
    // what a crafted sign-in link would want.
    '&prompt=select_account';

  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_REDIRECT);
  if (result.type !== 'success' || !result.url) throw new Error('Sign in cancelled');

  const { ticket } = readAuthRedirect(result.url, state, 'Google');

  const claim = httpsCallable<{ verifier: string; ticket: string }, { idToken: string }>(functions, 'claimGoogleSignIn');
  const { idToken } = (await claim({ verifier, ticket })).data;
  if (!idToken) throw new Error('Google could not complete the sign in. Try again.');
  return idToken;
}
