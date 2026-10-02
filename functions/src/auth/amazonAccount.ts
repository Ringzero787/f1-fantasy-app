/**
 * Login with Amazon: the token exchange and the Firebase account behind it.
 *
 * Extracted from `signInWithAmazon` so the hardened web flow (`amazonWebSignIn.ts`) and the
 * original callable — which older installed builds still call — share one implementation of what an
 * Amazon identity means in this project.
 */
import * as admin from 'firebase-admin';

export interface AmazonProfile {
  user_id: string;
  email?: string;
  name?: string;
}

interface AmazonTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Trades an authorization code for the person's Amazon profile. The `redirectUri` has to be the
 * same one the browser was sent to, which is why it is carried through the handoff.
 */
export async function exchangeAmazonCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<AmazonProfile> {
  const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!tokenRes.ok) {
    // The body can carry the code back; log Amazon's reason, not its echo of our request.
    console.error('Amazon token exchange failed:', tokenRes.status);
    throw new Error('exchange-failed');
  }

  const tokenData = (await tokenRes.json()) as AmazonTokenResponse;
  const profileRes = await fetch('https://api.amazon.com/user/profile', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) throw new Error('profile-failed');

  const profile = (await profileRes.json()) as AmazonProfile;
  if (!profile.user_id) throw new Error('profile-invalid');
  return profile;
}

/**
 * The Firebase user for an Amazon identity. The uid is `amazon:<user_id>` — stable, and the reason
 * an Amazon sign-in always reaches the same account from any build.
 *
 * It is deliberately *not* merged with an account of the same email under another provider: that
 * would be account linking decided by a string match, and an email a provider has not verified to
 * us would be a takeover vector. Someone with two accounts keeps two until there is a deliberate
 * "connect another sign-in" action (F-091 known gap).
 */
export async function upsertAmazonUser(profile: AmazonProfile): Promise<string> {
  const uid = `amazon:${profile.user_id}`;
  try {
    await admin.auth().getUser(uid);
    if (profile.name) await admin.auth().updateUser(uid, { displayName: profile.name });
    return uid;
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') {
      console.error('Firebase auth error:', (error as Error).message);
      throw new Error('user-lookup-failed');
    }
  }

  try {
    await admin.auth().createUser({ uid, email: profile.email, displayName: profile.name, emailVerified: true });
  } catch (createError) {
    if ((createError as { code?: string }).code === 'auth/email-already-exists') {
      // The address belongs to another provider's account. Make the Amazon account without it
      // rather than linking on a match; see the note above.
      await admin.auth().createUser({ uid, displayName: profile.name, emailVerified: true });
    } else {
      console.error('Firebase create user error:', (createError as Error).message);
      throw new Error('user-create-failed');
    }
  }
  return uid;
}
