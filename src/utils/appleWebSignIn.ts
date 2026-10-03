/**
 * Sign in with Apple from a build that has no Apple runtime (F-091) — the Play and Amazon builds.
 *
 * `expo-apple-authentication` exists on iOS only, so the Apple pill used to be absent everywhere
 * else and an account created on an iPhone was unreachable from an Android phone or a Fire tablet.
 * This runs Apple's web flow instead: a browser session, Apple's own consent screen, and the
 * identity token collected from our own endpoint (`functions/src/auth/appleWebSignIn.ts`) rather
 * than from the redirect, which on Android any installed app may claim.
 *
 * The token that comes back goes to the same `authService.signInWithApple` the iPhone uses, so both
 * paths land on one Firebase account — which is the entire point of the feature.
 *
 * Turned on by setting EXPO_PUBLIC_APPLE_SERVICES_ID at build time. Without it there is no Apple
 * client to authorise against, so the pill stays hidden rather than offering a button that fails.
 */
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { randomHex, sha256Hex } from './nonce';
import { readAuthRedirect } from './authRedirect';

/** The Apple *Services ID* — a separate client identifier from the iOS bundle id. */
const SERVICES_ID = process.env.EXPO_PUBLIC_APPLE_SERVICES_ID ?? '';
/**
 * Apple POSTs here, so it has to be https on a domain registered and verified under the Services
 * ID. Firebase Hosting serves it and rewrites it to the function (see firebase.json).
 */
const REDIRECT_URI = process.env.EXPO_PUBLIC_APPLE_REDIRECT_URI ?? 'https://f1-app-18077.web.app/undercut/auth/apple';
const APP_REDIRECT = 'theundercut://auth/apple';

const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Whether the web flow can be offered on this build. iOS is excluded on purpose: the native sheet
 * is better there, and Apple's guidelines expect the native control where it exists.
 */
export function appleWebSignInAvailable(): boolean {
  return !!SERVICES_ID && Platform.OS !== 'ios' && !isExpoGo;
}

export async function appleWebSignIn(): Promise<{ identityToken: string; nonce: string; displayName: string | null }> {
  if (!SERVICES_ID) throw new Error('Apple sign in is not configured in this build.');

  // Same shape as the native flow: Apple is given the hash and echoes it into the token, and
  // Firebase checks it against the raw value we keep here.
  const rawNonce = await randomHex(32);
  const hashedNonce = await sha256Hex(rawNonce);
  // The verifier never leaves the device; `state` is its hash and is the only part Apple sees.
  const verifier = await randomHex(32);
  const state = await sha256Hex(verifier);

  const authUrl =
    'https://appleid.apple.com/auth/authorize' +
    '?response_type=' + encodeURIComponent('code id_token') +
    '&response_mode=form_post' +
    '&client_id=' + encodeURIComponent(SERVICES_ID) +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
    '&scope=' + encodeURIComponent('name email') +
    '&state=' + encodeURIComponent(state) +
    '&nonce=' + encodeURIComponent(hashedNonce);

  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_REDIRECT);
  if (result.type !== 'success' || !result.url) throw new Error('Sign in cancelled');

  const { ticket } = readAuthRedirect(result.url, state);

  const claim = httpsCallable<{ verifier: string; ticket: string }, { idToken: string; displayName: string | null }>(functions, 'claimAppleSignIn');
  const { idToken, displayName } = (await claim({ verifier, ticket })).data;
  if (!idToken) throw new Error('Apple could not complete the sign in. Try again.');

  return { identityToken: idToken, nonce: rawNonce, displayName };
}
