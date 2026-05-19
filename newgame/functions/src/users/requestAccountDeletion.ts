// tlRequestAccountDeletion — public HTTPS endpoint that records account-
// deletion requests submitted from humannpc.com/tracklimits/delete-account.
//
// Required by Google Play's Data Safety form: users must be able to request
// deletion of their account and data without being signed in. We record the
// request to Firestore so the admin can look up the matching auth UID and
// either delete the account directly (via Firebase Console) or via the
// existing adminDeleteUser callable in the Undercut codebase.

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { applyCors } from '../triggers/_cors';

const db = admin.firestore();

interface DeletionRequestBody {
  email?: string;
  reason?: string;
}

export const tlRequestAccountDeletion = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const { email, reason } = (req.body || {}) as DeletionRequestBody;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'email required' });
    return;
  }
  const trimmedEmail = email.trim().toLowerCase().slice(0, 320);
  const trimmedReason = (reason || '').toString().slice(0, 2000);

  await db.collection('tl_deletion_requests').add({
    email: trimmedEmail,
    reason: trimmedReason,
    status: 'pending',
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    userAgent: req.headers['user-agent'] || null,
  });

  res.status(200).json({ ok: true });
});
