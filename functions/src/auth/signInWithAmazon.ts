/**
 * Login with Amazon, the original flow — kept for builds already installed.
 *
 * It exchanges whatever authorization code it is handed for a session on `amazon:<user_id>`, with
 * nothing binding the code to the device that started the flow. On Android a custom scheme is
 * claimable, so a code read off the `theundercut://auth/amazon` redirect is an account takeover.
 * That is why `amazonWebSignIn.ts` exists and why new builds use it: there, the code never reaches
 * the device at all.
 *
 * This stays because 2.4.0 and earlier call it and cannot be changed. Remove it once those builds
 * are out of circulation (Play's version-code statistics will say when).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { exchangeAmazonCode, upsertAmazonUser } from './amazonAccount';

const amazonClientId = defineSecret('AMAZON_CLIENT_ID');
const amazonClientSecret = defineSecret('AMAZON_CLIENT_SECRET');

export const signInWithAmazon = onCall(
  { secrets: [amazonClientId, amazonClientSecret] },
  async (request) => {
    const { code, redirectUri } = request.data ?? {};
    if (!code || !redirectUri || typeof code !== 'string' || typeof redirectUri !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing code or redirectUri');
    }

    let profile;
    let uid: string;
    try {
      profile = await exchangeAmazonCode(code, redirectUri, amazonClientId.value(), amazonClientSecret.value());
      uid = await upsertAmazonUser(profile);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      if (reason === 'exchange-failed' || reason === 'profile-failed' || reason === 'profile-invalid') {
        throw new HttpsError('unauthenticated', 'Failed to confirm the Amazon sign in');
      }
      throw new HttpsError('internal', 'Failed to create user');
    }

    return {
      customToken: await admin.auth().createCustomToken(uid),
      displayName: profile.name ?? '',
      email: profile.email ?? '',
    };
  },
);
