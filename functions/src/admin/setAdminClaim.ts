import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

/**
 * Callable Cloud Function to set admin custom claims on a user.
 * Can only be called by an existing admin.
 */
export const setAdminClaim = functions.https.onCall(async (data, context) => {
  // Must be authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Caller must already be an admin
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can grant admin access');
  }

  const { targetUid, isAdmin } = data;
  if (!targetUid || typeof isAdmin !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'Must provide targetUid and isAdmin boolean');
  }

  await admin.auth().setCustomUserClaims(targetUid, { admin: isAdmin });

  return { success: true, targetUid, isAdmin };
});

/**
 * Script-friendly function: bootstrap the first admin by email.
 * This is an HTTP function protected by checking a bootstrap secret
 * from the Firebase environment config.
 *
 * Usage (one-time setup):
 *   curl -X POST https://<region>-<project>.cloudfunctions.net/bootstrapAdmin \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"nathan.shanks@gmail.com","secret":"<BOOTSTRAP_SECRET>"}'
 */
export const bootstrapAdmin = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { email, secret } = req.body;

  // Check bootstrap secret from environment config (timing-safe comparison)
  const bootstrapSecret = functions.config().admin?.bootstrap_secret;
  if (!bootstrapSecret || typeof secret !== 'string' || secret.length === 0) {
    res.status(403).json({ error: 'Invalid bootstrap secret' });
    return;
  }
  const provided = Buffer.from(secret);
  const expected = Buffer.from(bootstrapSecret);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.status(403).json({ error: 'Invalid bootstrap secret' });
    return;
  }

  if (!email) {
    res.status(400).json({ error: 'Must provide email' });
    return;
  }

  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    res.json({ success: true, uid: user.uid, email });
  } catch (error) {
    res.status(500).json({ error: 'Failed to set admin claim' });
  }
});
