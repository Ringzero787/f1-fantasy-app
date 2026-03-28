import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const amazonClientId = defineSecret('AMAZON_CLIENT_ID');
const amazonClientSecret = defineSecret('AMAZON_CLIENT_SECRET');

interface AmazonTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface AmazonProfile {
  user_id: string;
  email: string;
  name: string;
}

export const signInWithAmazon = onCall(
  { secrets: [amazonClientId, amazonClientSecret] },
  async (request) => {
    const { code, redirectUri } = request.data;

    if (!code || !redirectUri) {
      throw new HttpsError('invalid-argument', 'Missing code or redirectUri');
    }

    // Exchange auth code for access token
    const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: amazonClientId.value(),
        client_secret: amazonClientSecret.value(),
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Amazon token exchange failed:', err);
      throw new HttpsError('unauthenticated', 'Failed to exchange Amazon auth code');
    }

    const tokenData = (await tokenRes.json()) as AmazonTokenResponse;

    // Fetch user profile
    const profileRes = await fetch('https://api.amazon.com/user/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      throw new HttpsError('unauthenticated', 'Failed to fetch Amazon profile');
    }

    const profile = (await profileRes.json()) as AmazonProfile;

    if (!profile.user_id) {
      throw new HttpsError('unauthenticated', 'Invalid Amazon profile');
    }

    const uid = `amazon:${profile.user_id}`;

    // Create or update Firebase user
    try {
      await admin.auth().getUser(uid);
      // User exists — update if needed
      await admin.auth().updateUser(uid, {
        displayName: profile.name,
      });
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        try {
          await admin.auth().createUser({
            uid,
            email: profile.email,
            displayName: profile.name,
            emailVerified: true,
          });
        } catch (createError: any) {
          if (createError.code === 'auth/email-already-exists') {
            // Email used by another provider (e.g. Google) — create without email
            await admin.auth().createUser({
              uid,
              displayName: profile.name,
              emailVerified: true,
            });
          } else {
            console.error('Firebase create user error:', createError);
            throw new HttpsError('internal', 'Failed to create user');
          }
        }
      } else {
        console.error('Firebase auth error:', error);
        throw new HttpsError('internal', 'Failed to create user');
      }
    }

    // Mint custom token
    const customToken = await admin.auth().createCustomToken(uid);

    return {
      customToken,
      displayName: profile.name,
      email: profile.email,
    };
  }
);
