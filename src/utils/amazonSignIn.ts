/**
 * Login with Amazon.
 *
 * Two flows live here. The hardened one (F-091) sends the browser to our own endpoint, which files
 * Amazon's authorization code server-side and returns only a state; the app trades a verifier it
 * never let go of for a Firebase custom token, and the code is exchanged with Amazon on the server.
 * That is what lets the button be offered on the Play and iOS builds: in the old flow the code
 * comes back on `theundercut://auth/amazon`, and on Android any installed app may claim that
 * scheme — a code read off it is an account takeover, Pit Wall Pass included.
 *
 * The old flow is still here, and is still what runs when EXPO_PUBLIC_AMAZON_REDIRECT_URI is not
 * set in the build, because the new endpoint has to be registered as an allowed return URL in the
 * Login with Amazon security profile first. Until it is, the button stays where it has always been
 * — the Amazon build only — rather than widening the old exposure. `amazonWebSignInAvailable()` is
 * that switch.
 */
import * as WebBrowser from 'expo-web-browser';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { randomHex, sha256Hex } from './nonce';

const AMAZON_CLIENT_ID = process.env.EXPO_PUBLIC_AMAZON_CLIENT_ID!;
/** The old static page, which bounces the code straight to the app. */
const LEGACY_REDIRECT_URI = 'https://www.humannpc.com/undercut/auth/amazon';
/** Our own endpoint (Hosting rewrite → `amazonAuthRedirect`). Must match RETURN_URL there. */
const REDIRECT_URI = process.env.EXPO_PUBLIC_AMAZON_REDIRECT_URI ?? '';
const APP_REDIRECT = 'theundercut://auth/amazon';

/** Whether the hardened flow is configured, and so whether the button is safe to show anywhere. */
export function amazonWebSignInAvailable(): boolean {
  return !!AMAZON_CLIENT_ID && !!REDIRECT_URI;
}

const authUrl = (redirectUri: string, state?: string): string =>
  'https://www.amazon.com/ap/oa' +
  '?client_id=' + encodeURIComponent(AMAZON_CLIENT_ID) +
  '&scope=profile' +
  '&response_type=code' +
  (state ? '&state=' + encodeURIComponent(state) : '') +
  '&redirect_uri=' + encodeURIComponent(redirectUri);

/**
 * The hardened flow. Returns a Firebase custom token; the authorization code never comes near the
 * device.
 */
export async function amazonWebSignIn(): Promise<{ customToken: string; displayName: string; email: string }> {
  const verifier = await randomHex(32);
  const state = await sha256Hex(verifier);

  const result = await WebBrowser.openAuthSessionAsync(authUrl(REDIRECT_URI, state), APP_REDIRECT);
  if (result.type !== 'success' || !result.url) throw new Error('Sign in cancelled');

  const params = new URLSearchParams(result.url.split('?')[1] ?? '');
  if (params.get('error') === 'cancelled') throw new Error('Sign in cancelled');
  if (params.get('error')) throw new Error('Amazon could not complete the sign in. Try again.');
  // A redirect we did not start, or one replayed from another session, stops here.
  if (params.get('state') !== state) throw new Error('Sign in could not be verified. Try again.');

  const claim = httpsCallable<{ verifier: string }, { customToken: string; displayName: string; email: string }>(functions, 'claimAmazonSignIn');
  const { customToken, displayName, email } = (await claim({ verifier })).data;
  if (!customToken) throw new Error('Amazon could not complete the sign in. Try again.');
  return { customToken, displayName, email };
}

// ── The old flow, for builds made before the endpoint existed ───────────────
let _resolve: ((value: { code: string; redirectUri: string }) => void) | null = null;
let _reject: ((reason: Error) => void) | null = null;

/** Called from _layout.tsx when a theundercut://auth/amazon deep link arrives. */
export function handleAmazonDeepLink(url: string) {
  const codeMatch = url.match(/[?&]code=([^&]+)/);
  if (codeMatch && _resolve) {
    _resolve({ code: codeMatch[1], redirectUri: LEGACY_REDIRECT_URI });
    _resolve = null;
    _reject = null;
    WebBrowser.dismissBrowser();
  } else if (_reject) {
    _reject(new Error('No auth code received'));
    _resolve = null;
    _reject = null;
  }
}

export async function amazonSignIn(): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;

    WebBrowser.openBrowserAsync(authUrl(LEGACY_REDIRECT_URI)).then((result) => {
      // If browser was dismissed without a deep link
      if (result.type === 'cancel' && _reject) {
        _reject(new Error('Sign in cancelled'));
        _resolve = null;
        _reject = null;
      }
    });
  });
}
